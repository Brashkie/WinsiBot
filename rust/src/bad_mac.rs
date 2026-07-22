//! bad_mac.rs — Per-group Bad MAC sliding-window counter, con cooldown
//! escalonado y persistencia en DuckDB/SQLite.
//!
//! Cada grupo tiene su propio contador independiente.
//! Un grupo con flood NO afecta a los demás.
//! Umbral: BAD_MAC_THRESHOLD eventos en BAD_MAC_WINDOW_SECS → shouldClear = true.
//! La ventana es un sliding window log real (deque de timestamps, se purga en
//! cada evento) — no un tumbling window de bloques fijos. Con bloques fijos,
//! una ráfaga repartida justo alrededor del límite de un bloque nunca cruza
//! el umbral en ninguno de los dos bloques aunque el total real sí lo haga;
//! el log de timestamps no tiene ese punto ciego. O(1) amortizado por evento.
//! Las entradas de grupos sin historial de clears se liberan periódicamente
//! si quedan inactivas (ver cleanup() / tasks.rs) — evita crecimiento sin
//! cota del mapa con más grupos y más tiempo de actividad.
//! Después de triggear, el grupo tiene un cooldown antes de volver a triggear
//! — evita bucles de clear infinitos. El cooldown escala con la cantidad de
//! veces que el grupo ya reincidió (lifetime_clears): 10s → 30s → 90s → ...
//! hasta un tope, en vez de repetir siempre el mismo ciclo corto para un
//! grupo crónicamente problemático.
//!
//! Además del contador por grupo, hay un contador GLOBAL independiente
//! (GLOBAL_BAD_MAC_THRESHOLD eventos en GLOBAL_BAD_MAC_WINDOW_SECS, sin
//! importar de qué grupo vinieron). Visto en producción: una sesión Signal
//! corrupta a nivel de cuenta puede manifestarse como Bad MAC repartidos
//! entre muchos grupos distintos — 2-3 por grupo, nunca cruzando el umbral
//! de ningún grupo individual — y el bot se queda sordo (nada se descifra
//! en ningún lado) sin que la limpieza automática por grupo se dispare nunca.
//! El contador global existe exactamente para ese escenario.
//!
//! Cada clear (por grupo o global) se persiste en DuckDB (bad_mac_events,
//! mismo archivo que usa conversations.rs) y en el audit_log de SQLite
//! (mismo patrón que usa el watchdog en tasks.rs) — así el historial
//! sobrevive un reinicio de Rust, y al arrancar (main.rs) se hidrata
//! lifetime_clears desde ese historial para no perder la escalada de
//! cooldown de un grupo (o del global) problemático.

use axum::{extract::State, http::StatusCode, response::Json};
use chrono::Utc;
use dashmap::DashMap;
use duckdb::params;
use serde::Deserialize;
use std::{
    collections::VecDeque,
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};

use crate::{alerts, conversations::ConvDb, db, routes::AppState};

// ── Configuración ─────────────────────────────────────────────────────────────
const BAD_MAC_THRESHOLD:    u32 = 5;   // eventos por grupo antes de shouldClear
const BAD_MAC_WINDOW_SECS:  u64 = 30;  // ventana deslizante (segundos)
const COOLDOWN_BASE_SECS:   u64 = 10;  // cooldown tras el primer clear (por grupo)
const COOLDOWN_MAX_SECS:    u64 = 600; // tope — 10 min

// Umbral global — ver comentario del módulo. Ventana más ancha y umbral más
// alto que el de un grupo individual porque agrega eventos de TODOS los
// grupos; el cooldown parte más alto porque un clear global es más
// disruptivo (reconecta el socket completo, no solo afecta a un grupo).
const GLOBAL_BAD_MAC_THRESHOLD:   u32 = 8;
const GLOBAL_BAD_MAC_WINDOW_SECS: u64 = 60;
const GLOBAL_COOLDOWN_BASE_SECS:  u64 = 30;

// Sentinel usado para persistir/hidratar el estado global en la misma tabla
// bad_mac_events (que está indexada por jid) sin necesitar una tabla aparte.
const GLOBAL_MARKER: &str = "*global*";

/// Cooldown escalonado según cuántas veces ya reincidió (grupo o global):
/// base → base×3 → base×9 → ... capado en COOLDOWN_MAX_SECS.
fn cooldown_for(lifetime_clears: u32, base_secs: u64) -> u64 {
    let exp = lifetime_clears.min(6); // 3^6 * base ya excede el tope, no hace falta más
    base_secs.saturating_mul(3u64.saturating_pow(exp)).min(COOLDOWN_MAX_SECS)
}

// ── Estado por grupo ──────────────────────────────────────────────────────────
// `events` es un log de timestamps (ventana deslizante real), no un contador
// con reset en bloques fijos ("tumbling window"). Con un tumbling window, una
// ráfaga repartida justo alrededor del límite de un bloque (p. ej. 4 eventos
// a los 29s de una ventana de 30s + 4 a los 31s, ya en el bloque siguiente)
// nunca cruza el umbral en NINGUNO de los dos bloques, aunque sean 8 eventos
// reales en 2 segundos — un punto ciego matemático real. Purgando eventos
// viejos del frente de la deque en cada report() en vez de resetear todo en
// bloques, el conteo siempre refleja la ventana real de los últimos
// BAD_MAC_WINDOW_SECS, sin ese punto ciego — O(1) amortizado por evento, cada
// timestamp se empuja y se saca como máximo una vez.
#[derive(Debug)]
struct GroupState {
    events:          VecDeque<Instant>,
    cleared_at:      Option<Instant>,
    lifetime_clears: u32,
}

impl GroupState {
    fn new() -> Self {
        Self {
            events:          VecDeque::new(),
            cleared_at:      None,
            lifetime_clears: 0,
        }
    }

    /// Purga eventos fuera de la ventana y devuelve la cantidad restante.
    fn prune_and_count(&mut self, window: Duration, now: Instant) -> u32 {
        while matches!(self.events.front(), Some(t) if now.duration_since(*t) > window) {
            self.events.pop_front();
        }
        self.events.len() as u32
    }

    /// Última actividad conocida — para decidir si esta entrada se puede
    /// liberar de memoria (ver BadMacTracker::cleanup).
    fn last_activity(&self) -> Option<Instant> {
        self.events.back().copied().max(self.cleared_at)
    }
}

// ── Estado global ──────────────────────────────────────────────────────────────
// Misma forma que GroupState — un solo contador compartido entre todos los grupos.
type GlobalState = GroupState;

// ── Tracker compartido ────────────────────────────────────────────────────────
// `inner` es DashMap, no Mutex<HashMap> — un reconexión masiva (p. ej. tras un
// clear global) puede hacer que MUCHOS grupos reporten Bad MAC casi al mismo
// tiempo; con un solo Mutex global, esa ráfaga se serializaría entera detrás
// de un único lock aunque sean grupos completamente independientes entre sí.
// `global` sigue siendo un Mutex normal a propósito: es un único contador
// compartido por diseño (agrega TODOS los grupos), no hay nada que shardear.
#[derive(Clone)]
pub struct BadMacTracker {
    inner:  Arc<DashMap<String, GroupState>>,
    global: Arc<Mutex<GlobalState>>,
}

impl BadMacTracker {
    pub fn new() -> Self {
        Self {
            inner:  Arc::new(DashMap::new()),
            global: Arc::new(Mutex::new(GlobalState::new())),
        }
    }

    /// Registra un Bad MAC para `jid`. Devuelve (count, should_clear, lifetime_clears).
    pub fn report(&self, jid: &str) -> (u32, bool, u32) {
        let mut entry = self.inner.entry(jid.to_string()).or_insert_with(GroupState::new);
        let now       = Instant::now();

        // Si el último clear fue hace menos que el cooldown (escalonado), suprimir
        if let Some(cleared) = entry.cleared_at {
            let cooldown = cooldown_for(entry.lifetime_clears, COOLDOWN_BASE_SECS);
            if now.duration_since(cleared) < Duration::from_secs(cooldown) {
                return (entry.events.len() as u32, false, entry.lifetime_clears);
            }
        }

        let window = Duration::from_secs(BAD_MAC_WINDOW_SECS);
        entry.events.push_back(now);
        let count = entry.prune_and_count(window, now);

        let should_clear = count >= BAD_MAC_THRESHOLD;
        if should_clear {
            entry.lifetime_clears += 1;
            tracing::warn!(
                jid             = %jid,
                count           = count,
                threshold       = BAD_MAC_THRESHOLD,
                lifetime_clears = entry.lifetime_clears,
                cooldown_s      = cooldown_for(entry.lifetime_clears, COOLDOWN_BASE_SECS),
                "Bad MAC threshold — señalando clear para este grupo"
            );
            entry.events.clear();
            entry.cleared_at = Some(now);
        }

        (count, should_clear, entry.lifetime_clears)
    }

    /// Registra un Bad MAC en el contador GLOBAL (agregado de todos los
    /// grupos). Se llama junto con `report()` en cada evento — ver comentario
    /// del módulo. Devuelve (count, should_clear, lifetime_clears).
    pub fn report_global(&self) -> (u32, bool, u32) {
        let mut global = self.global.lock().unwrap();
        let now        = Instant::now();

        if let Some(cleared) = global.cleared_at {
            let cooldown = cooldown_for(global.lifetime_clears, GLOBAL_COOLDOWN_BASE_SECS);
            if now.duration_since(cleared) < Duration::from_secs(cooldown) {
                return (global.events.len() as u32, false, global.lifetime_clears);
            }
        }

        let window = Duration::from_secs(GLOBAL_BAD_MAC_WINDOW_SECS);
        global.events.push_back(now);
        let count = global.prune_and_count(window, now);

        let should_clear = count >= GLOBAL_BAD_MAC_THRESHOLD;
        if should_clear {
            global.lifetime_clears += 1;
            tracing::warn!(
                count           = count,
                threshold       = GLOBAL_BAD_MAC_THRESHOLD,
                lifetime_clears = global.lifetime_clears,
                cooldown_s      = cooldown_for(global.lifetime_clears, GLOBAL_COOLDOWN_BASE_SECS),
                "Bad MAC GLOBAL threshold — sesión corrupta repartida entre grupos, señalando clear"
            );
            global.events.clear();
            global.cleared_at = Some(now);
        }

        (count, should_clear, global.lifetime_clears)
    }

    /// Resetea manualmente el contador de un grupo (p. ej. tras clear manual).
    pub fn reset(&self, jid: &str) {
        self.inner.remove(jid);
    }

    /// Hidrata lifetime_clears de un grupo (o del global, vía GLOBAL_MARKER)
    /// al arrancar, desde el historial persistido en DuckDB — así un reinicio
    /// de Rust no resetea la escalada de cooldown de un grupo (o del global)
    /// problemático (ver main.rs).
    pub fn seed(&self, jid: &str, lifetime_clears: u32) {
        if jid == GLOBAL_MARKER {
            let mut global = self.global.lock().unwrap();
            global.lifetime_clears = lifetime_clears;
            return;
        }
        let mut entry = self.inner.entry(jid.to_string()).or_insert_with(GroupState::new);
        entry.lifetime_clears = lifetime_clears;
    }

    /// Devuelve stats de todos los grupos con contadores o historial activos.
    pub fn stats(&self) -> Vec<serde_json::Value> {
        self.inner
            .iter()
            .filter(|e| !e.value().events.is_empty() || e.value().lifetime_clears > 0)
            .map(|e| {
                let v = e.value();
                serde_json::json!({
                    "jid":              e.key(),
                    "count":            v.events.len(),
                    "lifetimeClears":   v.lifetime_clears,
                    "currentCooldownS": cooldown_for(v.lifetime_clears, COOLDOWN_BASE_SECS),
                })
            })
            .collect()
    }

    /// Devuelve el estado actual del contador global.
    pub fn global_stats(&self) -> serde_json::Value {
        let global = self.global.lock().unwrap();
        serde_json::json!({
            "count":            global.events.len(),
            "lifetimeClears":   global.lifetime_clears,
            "currentCooldownS": cooldown_for(global.lifetime_clears, GLOBAL_COOLDOWN_BASE_SECS),
        })
    }

    /// Libera memoria de grupos inactivos que NUNCA llegaron a disparar un
    /// clear — sin esto, cualquier grupo que tuvo aunque sea un Bad MAC
    /// suelto quedaba en el mapa para siempre, sin límite, mientras el
    /// proceso siguiera corriendo (más grupos + más tiempo de actividad =
    /// crecimiento sin cota). Los grupos que SÍ reincidieron
    /// (lifetime_clears > 0) se mantienen indefinidamente en memoria: son una
    /// minoría, y perder ese contador reiniciaría su cooldown escalonado a
    /// cero, tratando a un grupo crónicamente problemático como si fuera la
    /// primera vez que pasa.
    pub fn cleanup(&self, inactive_secs: u64) -> usize {
        let now    = Instant::now();
        let before = self.inner.len();
        self.inner.retain(|_, v| {
            v.lifetime_clears > 0
                || v.last_activity()
                    .map(|t| now.duration_since(t) < Duration::from_secs(inactive_secs))
                    .unwrap_or(false)
        });
        before - self.inner.len()
    }
}

// ── Persistencia DuckDB — historial de clears, sobrevive reinicios de Rust ───

// Recibe la MISMA conexión compartida que usa conversations.rs (ver ConvDb),
// no una propia — DuckDB es single-writer por archivo, y abrir una segunda
// Connection::open() al mismo path mientras conversations::init() ya tiene el
// archivo abierto dejaba la tabla creada en una conexión que la conexión
// compartida (la que después hace los INSERT reales en record_clear) nunca
// llegaba a ver: en producción, bad_mac_events nunca se creó de verdad — cada
// intento de persistir un clear fallaba en silencio con "Catalog Error: Table
// with name bad_mac_events does not exist" (confirmado inspeccionando la
// DuckDB real: solo tenía conversations/user_style). Usando la misma conexión
// para crear la tabla, no hay dos vistas de catálogo distintas que puedan
// desincronizarse.
pub fn init_schema(conv_db: &ConvDb) {
    match conv_db.lock() {
        Ok(conn) => {
            let r = conn.execute_batch(
                "CREATE TABLE IF NOT EXISTS bad_mac_events (
                    id              VARCHAR DEFAULT gen_random_uuid(),
                    jid             VARCHAR NOT NULL,
                    ts              BIGINT  NOT NULL,
                    count           INTEGER NOT NULL,
                    lifetime_clears INTEGER NOT NULL,
                    cooldown_secs   BIGINT  NOT NULL
                );",
            );
            if let Err(e) = r {
                tracing::warn!("DuckDB bad_mac_events schema init error: {}", e);
            }
        }
        Err(e) => tracing::warn!("DuckDB lock error (bad_mac init_schema): {}", e),
    }
}

fn record_clear(
    conv_db:         &ConvDb,
    jid:             &str,
    count:           u32,
    lifetime_clears: u32,
    cooldown_secs:   u64,
) -> Result<(), String> {
    let conn = conv_db.lock().map_err(|e| e.to_string())?;
    let ts   = Utc::now().timestamp_millis();
    conn.execute(
        "INSERT INTO bad_mac_events (jid, ts, count, lifetime_clears, cooldown_secs)
         VALUES (?, ?, ?, ?, ?)",
        params![jid, ts, count, lifetime_clears, cooldown_secs as i64],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

/// Cuenta clears por grupo en las últimas `hours` horas — usado al arrancar
/// para hidratar el tracker en memoria (ver main.rs).
pub fn recent_clear_counts(conv_db: &ConvDb, hours: i64) -> Vec<(String, u32)> {
    let conn = match conv_db.lock() {
        Ok(c)  => c,
        Err(e) => { tracing::warn!("DuckDB lock error (bad_mac hydrate): {}", e); return Vec::new() }
    };

    let since = Utc::now().timestamp_millis() - hours * 3_600_000;

    let mut stmt = match conn.prepare(
        "SELECT jid, COUNT(*) FROM bad_mac_events WHERE ts > ? GROUP BY jid",
    ) {
        Ok(s)  => s,
        Err(e) => { tracing::warn!("DuckDB prepare error (bad_mac hydrate): {}", e); return Vec::new() }
    };

    let rows = stmt.query_map(params![since], |row| {
        let jid:   String = row.get(0)?;
        let count: i64     = row.get(1)?;
        Ok((jid, count as u32))
    });

    match rows {
        Ok(iter) => iter.filter_map(|r| r.ok()).collect(),
        Err(e)   => { tracing::warn!("DuckDB query error (bad_mac hydrate): {}", e); Vec::new() }
    }
}

// ── Request bodies ────────────────────────────────────────────────────────────
#[derive(Deserialize)]
pub struct JidBody {
    pub jid: String,
}

// ── POST /badmac/report ───────────────────────────────────────────────────────
pub async fn report_bad_mac(
    State(state): State<AppState>,
    Json(body):   Json<JidBody>,
) -> (StatusCode, Json<serde_json::Value>) {
    if body.jid.is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "ok": false, "error": "jid requerido" })),
        );
    }

    let (count, should_clear_group, lifetime_clears) = state.bad_mac.report(&body.jid);
    // El chequeo global corre SIEMPRE, sin importar el resultado del check
    // por grupo de arriba — ver comentario del módulo.
    let (global_count, should_clear_global, global_lifetime_clears) = state.bad_mac.report_global();

    if should_clear_group {
        let cooldown = cooldown_for(lifetime_clears, COOLDOWN_BASE_SECS);

        alerts::fire(
            &state,
            &format!(
                "🟠 WinsiBot: Bad MAC threshold en grupo {} ({count} eventos, reincidencia #{lifetime_clears}) — limpiando sesiones Signal (cooldown {cooldown}s)",
                body.jid
            ),
        ).await;

        // Persistencia — fire-and-forget, no bloquea la respuesta ni afecta
        // la decisión en caliente (que ya se tomó arriba, en memoria).
        let conv_db = state.conv_db.clone();
        let jid_c   = body.jid.clone();
        tokio::task::spawn_blocking(move || {
            if let Err(e) = record_clear(&conv_db, &jid_c, count, lifetime_clears, cooldown) {
                tracing::warn!(error = %e, "bad_mac: fallo al persistir evento en DuckDB");
            }
        });

        let audit_db = state.db.clone();
        let detail = serde_json::json!({
            "jid": body.jid, "count": count,
            "lifetimeClears": lifetime_clears, "cooldownSecs": cooldown,
        }).to_string();
        tokio::task::spawn_blocking(move || {
            let _ = db::audit_log(&audit_db, "bad_mac", "clear", Some(&detail));
        });
    }

    if should_clear_global {
        let cooldown = cooldown_for(global_lifetime_clears, GLOBAL_COOLDOWN_BASE_SECS);

        alerts::fire(
            &state,
            &format!(
                "🔴 WinsiBot: Bad MAC GLOBAL threshold ({global_count} eventos repartidos entre grupos, reincidencia #{global_lifetime_clears}) — limpiando sesiones Signal (cooldown {cooldown}s)"
            ),
        ).await;

        let conv_db = state.conv_db.clone();
        tokio::task::spawn_blocking(move || {
            if let Err(e) = record_clear(&conv_db, GLOBAL_MARKER, global_count, global_lifetime_clears, cooldown) {
                tracing::warn!(error = %e, "bad_mac: fallo al persistir evento global en DuckDB");
            }
        });

        let audit_db = state.db.clone();
        let detail = serde_json::json!({
            "scope": "global", "count": global_count,
            "lifetimeClears": global_lifetime_clears, "cooldownSecs": cooldown,
        }).to_string();
        tokio::task::spawn_blocking(move || {
            let _ = db::audit_log(&audit_db, "bad_mac", "clear_global", Some(&detail));
        });
    }

    let should_clear = should_clear_group || should_clear_global;

    (
        StatusCode::OK,
        Json(serde_json::json!({
            "ok":              true,
            "jid":             body.jid,
            "count":           count,
            "threshold":       BAD_MAC_THRESHOLD,
            "shouldClear":     should_clear,
            // "group" salvo que el que disparó haya sido específicamente el
            // umbral global — así TS sabe si limpiar "este grupo" o toda la
            // sesión, y loguear el motivo real en vez de uno genérico.
            "scope":           if should_clear_global { "global" } else { "group" },
            "lifetimeClears":  lifetime_clears,
            "globalCount":     global_count,
            "globalThreshold": GLOBAL_BAD_MAC_THRESHOLD,
            "ts":              Utc::now(),
        })),
    )
}

// ── POST /badmac/reset ────────────────────────────────────────────────────────
pub async fn reset_bad_mac(
    State(state): State<AppState>,
    Json(body):   Json<JidBody>,
) -> Json<serde_json::Value> {
    state.bad_mac.reset(&body.jid);
    Json(serde_json::json!({ "ok": true, "jid": body.jid, "ts": Utc::now() }))
}

// ── GET /badmac/stats ─────────────────────────────────────────────────────────
pub async fn bad_mac_stats(
    State(state): State<AppState>,
) -> Json<serde_json::Value> {
    let groups = state.bad_mac.stats();
    Json(serde_json::json!({
        "ok":              true,
        "threshold":       BAD_MAC_THRESHOLD,
        "window_s":        BAD_MAC_WINDOW_SECS,
        "groups":          groups,
        "global":          state.bad_mac.global_stats(),
        "globalThreshold": GLOBAL_BAD_MAC_THRESHOLD,
        "globalWindowS":   GLOBAL_BAD_MAC_WINDOW_SECS,
        "ts":              Utc::now(),
    }))
}

// ── POST /badmac/export — vuelca bad_mac_events a Parquet (analítica) ────────
pub async fn export_bad_mac(State(state): State<AppState>) -> Json<serde_json::Value> {
    let conv_db = state.conv_db.clone();
    let path    = state.conv_db_path.clone();

    let res = tokio::task::spawn_blocking(move || -> Result<String, String> {
        let conn = conv_db.lock().map_err(|e| e.to_string())?;
        let out  = path.replace(".duckdb", "_bad_mac.parquet").replace('\\', "/");
        conn.execute_batch(&format!(
            "COPY bad_mac_events TO '{out}' (FORMAT PARQUET, COMPRESSION ZSTD)"
        )).map_err(|e| e.to_string())?;
        Ok(out)
    }).await;

    match res {
        Ok(Ok(p))  => Json(serde_json::json!({ "ok": true,  "path": p })),
        Ok(Err(e)) => Json(serde_json::json!({ "ok": false, "error": e })),
        Err(e)     => Json(serde_json::json!({ "ok": false, "error": e.to_string() })),
    }
}
