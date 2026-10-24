//! conversations.rs
//! Almacenamiento SQLite de conversaciones y perfiles de estilo para la IA.
//!
//! Routes: POST /ai/learn, POST /ai/observe, GET /ai/context/{sender},
//!         GET /ai/profile/{jid}, DELETE /ai/profile/{jid},
//!         GET /ai/group-style/{gjid}, GET /ai/corpus/stats, POST /ai/export
//!
//! Conexión SQLite COMPARTIDA (Arc<Mutex<Connection>>, mismo patrón que
//! db::Db para SQLite) — antes cada llamada a estos tres endpoints abría una
//! conexión nueva desde cero (Connection::open) contra el mismo archivo.
//! GET /ai/context/:sender está en el camino crítico de CADA respuesta de IA
//! (Node lo llama con presupuesto de 300ms antes de generar la respuesta) —
//! abrir el archivo entero en cada mensaje, bajo carga real con
//! miles de mensajes/hora, es overhead evitable que además compite por el
//! lock de escritura con llamadas concurrentes a bad_mac.rs (mismo
//! archivo). Una sola conexión, serializada con un mutex, es más barata que
//! reabrir el archivo y elimina esa contención entre módulos.

use axum::{
    extract::{Path, Query, State},
    response::Json,
};
use chrono::Utc;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::sync::{Arc, LockResult, Mutex, MutexGuard};

use crate::routes::AppState;
use crate::user_memory::Perfil;

pub type ConvDb = Arc<BaseConv>;

/// Un mensaje de grupo observado, esperando a escribirse.
pub struct Observado {
    pub sender: String,
    pub gjid: String,
    pub text: String,
    pub ts: i64,
}

/// Cuántos perfiles de memoria se guardan en el caché como mucho. Pasado eso,
/// se descartan los que no tienen cambios pendientes; vuelven a leerse de la
/// base si alguien los pide.
const PERFILES_MAX: usize = 20_000;

/// La base de conversaciones, con escritura diferida.
///
/// ## Por qué
///
/// Por CADA mensaje de grupo, la API escribía dos veces: el mensaje observado
/// (`/ai/observe`) y la memoria del remitente (`/ai/memory/:jid/update`), cada
/// una su propia transacción. Medido aislado con el esquema real, 10.000 filas:
/// en autocommit, **131,5 µs por fila**; en una transacción, **3,7 µs**, 35
/// veces menos. El costo no era el INSERT sino el commit de cada uno: escribir
/// en el WAL las páginas de la tabla y de sus dos índices.
///
/// ## Cómo
///
/// Los mensajes observados van a una cola, y los perfiles de memoria se leen y
/// modifican en un caché que anota cuáles cambiaron. Una tarea de fondo
/// (`tasks.rs`) los escribe cada segundo **en una sola transacción**.
///
/// La garantía de que nadie lee algo viejo está en [`BaseConv::lock`]: TODO
/// acceso a la conexión pasa por ahí, y ahí se vacía la cola antes de entregar
/// la conexión. Las consultas que leen estas tablas no cambiaron una línea.
///
/// Lo que se puede perder si el proceso muere de golpe: hasta un segundo de
/// mensajes observados y de contadores de memoria. Es el corpus de estilo y la
/// reputación, no datos críticos; el apagado ordenado vacía la cola antes de
/// salir.
pub struct BaseConv {
    conn: Mutex<Connection>,
    observados: Mutex<Vec<Observado>>,
    pub(crate) perfiles: Mutex<HashMap<String, Perfil>>,
    sucios: Mutex<HashSet<String>>,
}

impl BaseConv {
    pub fn nueva(conn: Connection) -> ConvDb {
        // Las sentencias del camino caliente se compilan una vez: con el
        // caché de 16 por defecto, las de una sesión larga se pisaban entre sí.
        conn.set_prepared_statement_cache_capacity(64);
        Arc::new(Self {
            conn: Mutex::new(conn),
            observados: Mutex::new(Vec::new()),
            perfiles: Mutex::new(HashMap::new()),
            sucios: Mutex::new(HashSet::new()),
        })
    }

    /// La conexión, con todo lo pendiente ya escrito. Misma forma que
    /// `Mutex::lock`, para que los llamadores no cambien.
    pub fn lock(&self) -> LockResult<MutexGuard<'_, Connection>> {
        match self.conn.lock() {
            Ok(mut g) => {
                self.vaciar(&mut g);
                Ok(g)
            }
            Err(e) => Err(e),
        }
    }

    /// Escribe ya lo pendiente. Lo usan la tarea de fondo, el apagado y la
    /// cola cuando crece mucho.
    pub fn vaciar_pendientes(&self) {
        if let Ok(g) = self.lock() {
            drop(g);
        }
    }

    /// Si hay algo esperando a escribirse. Barato: lo usa la tarea de fondo
    /// para no tomar la conexión cada segundo si no hay nada que hacer.
    pub fn hay_pendientes(&self) -> bool {
        self.observados
            .lock()
            .map(|v| !v.is_empty())
            .unwrap_or(false)
            || self.sucios.lock().map(|s| !s.is_empty()).unwrap_or(false)
    }

    /// Encola un mensaje observado. No toca la base. Devuelve cuántos hay.
    pub fn encolar(&self, o: Observado) -> usize {
        let mut v = self.observados.lock().unwrap_or_else(|e| e.into_inner());
        v.push(o);
        v.len()
    }

    /// Marca un perfil como modificado en el caché.
    pub(crate) fn marcar_sucio(&self, jid: &str) {
        self.sucios
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .insert(jid.to_string());
    }

    /// Escribe todo lo pendiente en una transacción. Si falla, lo pendiente
    /// vuelve a la cola para el próximo intento, en vez de perderse.
    fn vaciar(&self, conn: &mut Connection) {
        let obs = std::mem::take(&mut *self.observados.lock().unwrap_or_else(|e| e.into_inner()));
        let jids = std::mem::take(&mut *self.sucios.lock().unwrap_or_else(|e| e.into_inner()));
        if obs.is_empty() && jids.is_empty() {
            return;
        }
        let perfiles: Vec<Perfil> = {
            let mut cache = self.perfiles.lock().unwrap_or_else(|e| e.into_inner());
            let v = jids.iter().filter_map(|j| cache.get(j).cloned()).collect();
            if cache.len() > PERFILES_MAX {
                // Los que no tienen cambios pendientes se pueden volver a leer.
                cache.retain(|j, _| jids.contains(j));
            }
            v
        };
        let r = (|| -> rusqlite::Result<()> {
            let tx = conn.transaction()?;
            {
                let mut st = tx.prepare_cached(
                    "INSERT INTO conversations
                     (sender, gjid, text, intent, reply, mode, ts, len, has_emoji)
                     VALUES (?1, ?2, ?3, 'observed', '', 'observed', ?4, ?5, ?6)",
                )?;
                for o in &obs {
                    let has_emoji = o.text.chars().any(|c| (c as u32) > 0x2500);
                    st.execute(params![
                        o.sender,
                        o.gjid,
                        o.text,
                        o.ts,
                        o.text.len() as i32,
                        has_emoji
                    ])?;
                }
            }
            for p in &perfiles {
                crate::user_memory::escribir_en(&tx, p)?;
            }
            tx.commit()
        })();
        if let Err(e) = r {
            tracing::warn!(error = %e, observados = obs.len(), perfiles = perfiles.len(),
                "no se pudo vaciar la escritura diferida; se reintenta");
            self.observados
                .lock()
                .unwrap_or_else(|e| e.into_inner())
                .extend(obs);
            self.sucios
                .lock()
                .unwrap_or_else(|e| e.into_inner())
                .extend(jids);
        }
    }
}

// ── Structs ───────────────────────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct LearnRequest {
    pub sender: String,
    pub gjid: String,
    pub text: String,
    pub intent: String,
    pub reply: String,
    pub mode: String,
}

#[derive(Serialize)]
struct HistoryEntry {
    text: String,
    intent: String,
    reply: String,
    ts: i64,
}

#[derive(Serialize)]
struct UserStyle {
    total_msgs: i64,
    avg_len: f64,
    emoji_freq: f64,
    question_freq: f64,
    common_words: Vec<String>,
}

#[derive(Deserialize)]
pub struct ContextParams {
    pub limit: Option<i64>,
}

// ── Init ──────────────────────────────────────────────────────────────────────

pub fn init(path: &str) -> Result<ConvDb, rusqlite::Error> {
    if let Some(parent) = std::path::Path::new(path).parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let conn = Connection::open(path)?;
    // WAL + NORMAL: mismo criterio que db.rs. A diferencia de DuckDB, SQLite en
    // WAL admite lectores concurrentes mientras hay un escritor.
    let _ = conn.pragma_update(None, "journal_mode", "WAL");
    let _ = conn.pragma_update(None, "synchronous", "NORMAL");
    // Checkpoint del WAL cada 4000 páginas en vez de las 1000 de SQLite. En
    // WAL con NORMAL, el checkpoint es el único momento con fsync, y esta base
    // recibe todos los mensajes de todos los grupos: medido con 300.000 filas
    // (`examples/perfil_mensaje.rs`), el costo por mensaje baja de ~115 a
    // ~66 µs, y son 4 veces menos vaciados a la flash del teléfono. A cambio el
    // WAL puede llegar a ~16 MB en disco antes de consolidarse.
    let _ = conn.pragma_update(None, "wal_autocheckpoint", 4000);
    let r = conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS conversations (
            id        INTEGER PRIMARY KEY AUTOINCREMENT,
            sender    VARCHAR NOT NULL,
            gjid      VARCHAR NOT NULL DEFAULT '',
            text      VARCHAR NOT NULL,
            intent    VARCHAR NOT NULL DEFAULT 'neutral',
            reply     VARCHAR NOT NULL DEFAULT '',
            mode      VARCHAR NOT NULL DEFAULT 'amable',
            ts        BIGINT  NOT NULL,
            len       INTEGER NOT NULL DEFAULT 0,
            has_emoji INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS user_style (
            sender        VARCHAR PRIMARY KEY,
            total_msgs    BIGINT  NOT NULL DEFAULT 0,
            avg_len       REAL    NOT NULL DEFAULT 0.0,
            emoji_freq    REAL    NOT NULL DEFAULT 0.0,
            question_freq REAL    NOT NULL DEFAULT 0.0,
            common_words  VARCHAR NOT NULL DEFAULT '[]',
            updated_at    BIGINT  NOT NULL DEFAULT 0
        );
        -- Sin estos indices la tabla se recorria ENTERA en cada /ai/context
        -- (camino critico de cada respuesta) y en cada agregado de perfil.
        -- Importa mas desde que absorbe TODOS los mensajes de grupo, no solo
        -- los intercambios con la IA: son cientos de miles de filas.
        CREATE INDEX IF NOT EXISTS idx_conv_sender_ts ON conversations(sender, ts DESC);
        CREATE INDEX IF NOT EXISTS idx_conv_gjid_ts   ON conversations(gjid,   ts DESC);
    ",
    );
    if let Err(e) = r {
        tracing::warn!("SQLite schema init error (conversations): {}", e);
    }
    Ok(BaseConv::nueva(conn))
}

// ── POST /ai/learn ────────────────────────────────────────────────────────────

pub async fn ai_learn(
    State(state): State<AppState>,
    Json(req): Json<LearnRequest>,
) -> Json<serde_json::Value> {
    let conv_db = state.conv_db.clone();

    let res = tokio::task::spawn_blocking(move || -> Result<(), String> {
        let conn = conv_db.lock().map_err(|e| e.to_string())?;

        let has_emoji = req.text.chars().any(|c| (c as u32) > 0x2500);
        let has_q = req.text.contains('?');
        let len = req.text.len() as i32;
        let ts = Utc::now().timestamp_millis();

        conn.execute(
            "INSERT INTO conversations
             (sender, gjid, text, intent, reply, mode, ts, len, has_emoji)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            params![
                req.sender, req.gjid, req.text, req.intent, req.reply, req.mode, ts, len, has_emoji
            ],
        )
        .map_err(|e| e.to_string())?;

        // Recompute aggregates — una sola consulta combinada en vez de 3
        // separadas: cada round-trip acá se hace mientras se retiene el
        // mutex de la conexión COMPARTIDA con bad_mac.rs y con /ai/context
        // (camino crítico de cada respuesta de IA, presupuesto 300ms del
        // lado de Node) — menos queries, menos tiempo bloqueando a quien
        // espera ese mismo lock.
        let (total, avg_len, emoji_freq, question_freq): (i64, f64, f64, f64) = conn
            .query_row(
                "SELECT COUNT(*), AVG(len), AVG(CAST(has_emoji AS INTEGER)), \
                 AVG(CASE WHEN text LIKE '%?%' THEN 1.0 ELSE 0.0 END) \
                 FROM conversations WHERE sender = ?",
                params![req.sender],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
            )
            .unwrap_or((
                1,
                f64::from(len),
                if has_emoji { 1.0 } else { 0.0 },
                if has_q { 1.0 } else { 0.0 },
            ));

        let common_words = if total % 20 == 0 {
            compute_common_words(&conn, &req.sender)
        } else {
            conn.query_row(
                "SELECT COALESCE(common_words, '[]') FROM user_style WHERE sender = ?",
                params![req.sender],
                |r| r.get::<_, String>(0),
            )
            .unwrap_or_else(|_| "[]".to_string())
        };

        conn.execute(
            "INSERT INTO user_style
             (sender, total_msgs, avg_len, emoji_freq, question_freq, common_words, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT (sender) DO UPDATE SET
               total_msgs    = excluded.total_msgs,
               avg_len       = excluded.avg_len,
               emoji_freq    = excluded.emoji_freq,
               question_freq = excluded.question_freq,
               common_words  = excluded.common_words,
               updated_at    = excluded.updated_at",
            params![
                req.sender,
                total,
                avg_len,
                emoji_freq,
                question_freq,
                common_words,
                ts
            ],
        )
        .map_err(|e| e.to_string())?;

        Ok(())
    })
    .await;

    match res {
        Ok(Ok(())) => Json(serde_json::json!({ "ok": true })),
        Ok(Err(e)) => Json(serde_json::json!({ "ok": false, "error": e })),
        Err(e) => Json(serde_json::json!({ "ok": false, "error": e.to_string() })),
    }
}

fn compute_common_words(conn: &Connection, sender: &str) -> String {
    let texts: Vec<String> = conn
        .prepare("SELECT text FROM conversations WHERE sender = ? ORDER BY ts DESC LIMIT 200")
        .and_then(|mut s| {
            let rows = s
                .query_map(params![sender], |r| r.get::<_, String>(0))?
                .filter_map(|r| r.ok())
                .collect();
            Ok(rows)
        })
        .unwrap_or_default();

    serde_json::to_string(&top_words(&texts, 20)).unwrap_or_else(|_| "[]".to_string())
}

/// Palabras mas usadas, descartando las vacias de contenido.
///
/// Lo usan el perfil de usuario, el de grupo y el `user_style` que mantiene
/// `/ai/learn`. Estaba escrito una sola vez pero enterrado dentro de
/// `compute_common_words`, asi que al traer los perfiles de Python iba camino
/// de tener una segunda copia peor (sin lista de stopwords).
fn top_words(texts: &[String], top: usize) -> Vec<String> {
    let stop: std::collections::HashSet<&str> = [
        "de", "la", "el", "en", "y", "a", "que", "es", "se", "no", "un", "una", "los", "las",
        "por", "con", "para", "del", "al", "lo", "como", "más", "me", "te", "le", "su", "mi", "tu",
        "ya", "si", "pero", "hay",
    ]
    .iter()
    .copied()
    .collect();

    let mut freq: std::collections::HashMap<String, u32> = std::collections::HashMap::new();
    for text in texts {
        for raw in text.split_whitespace() {
            let w: String = raw
                .to_lowercase()
                .chars()
                .filter(|c| c.is_alphabetic())
                .collect();
            if w.len() >= 3 && !stop.contains(w.as_str()) {
                *freq.entry(w).or_insert(0) += 1;
            }
        }
    }

    let mut words: Vec<(String, u32)> = freq.into_iter().collect();
    // El desempate por palabra mantiene el resultado estable entre llamadas:
    // con solo cmp por frecuencia, el orden del HashMap decidia los empates y
    // el perfil cambiaba sin que el usuario escribiera nada.
    words.sort_by(|a, b| b.1.cmp(&a.1).then(a.0.cmp(&b.0)));
    words.into_iter().take(top).map(|(w, _)| w).collect()
}

// ── GET /ai/context/{sender} ──────────────────────────────────────────────────

pub async fn ai_context(
    State(state): State<AppState>,
    Path(sender): Path<String>,
    Query(params): Query<ContextParams>,
) -> Json<serde_json::Value> {
    let limit = params.limit.unwrap_or(8).clamp(1, 50);
    let conv_db = state.conv_db.clone();

    let res = tokio::task::spawn_blocking(move || -> Result<_, String> {
        let conn = conv_db.lock().map_err(|e| e.to_string())?;

        let mut stmt = conn
            // reply <> '' excluye las filas de /ai/observe, que son mensajes
            // sueltos sin respuesta del bot: alimentan el perfil de estilo,
            // pero como "historial" para armar el prompt serian pares vacios.
            .prepare(
                "SELECT text, intent, reply, ts \
                      FROM conversations WHERE sender = ? AND reply <> '' \
                      ORDER BY ts DESC LIMIT ?",
            )
            .map_err(|e| e.to_string())?;

        let mut history: Vec<HistoryEntry> = stmt
            .query_map(params![sender, limit], |row| {
                Ok(HistoryEntry {
                    text: row.get(0)?,
                    intent: row.get(1)?,
                    reply: row.get(2)?,
                    ts: row.get(3)?,
                })
            })
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect();

        history.reverse(); // oldest → newest

        let style = conn
            .query_row(
                "SELECT total_msgs, avg_len, emoji_freq, question_freq, common_words \
                 FROM user_style WHERE sender = ?",
                params![sender],
                |row| {
                    let words_json: String = row.get(4)?;
                    let common_words: Vec<String> =
                        serde_json::from_str(&words_json).unwrap_or_default();
                    Ok(UserStyle {
                        total_msgs: row.get(0)?,
                        avg_len: row.get(1)?,
                        emoji_freq: row.get(2)?,
                        question_freq: row.get(3)?,
                        common_words,
                    })
                },
            )
            .ok();

        Ok((history, style))
    })
    .await;

    match res {
        Ok(Ok((history, style))) => Json(serde_json::json!({
            "ok":      true,
            "history": history,
            "style":   style,
        })),
        _ => Json(serde_json::json!({ "ok": true, "history": [], "style": null })),
    }
}

// ─── Perfiles de estilo ──────────────────────────────────────────────────────
// Reemplazan a ai/trainer.py, que guardaba CADA mensaje otra vez en Parquet y
// consultaba con DuckDB para calcular lo mismo. Eran dos almacenes paralelos
// alimentados en el mismo handler: /ai/learn (acá) y /hepein/record (Python).
//
// Todo esto sale de la tabla `conversations` que ya se llenaba: no hace falta
// un segundo almacén, solo las agregaciones. Y de paso se van `pyarrow` y
// `duckdb` de requirements.txt, que en Termux compilan desde fuente.

const SAMPLE_MAX_LEN: usize = 120;

#[derive(Debug, Serialize)]
pub struct UserStyleProfile {
    pub jid: String,
    pub msg_count: i64,
    pub avg_len: f64,
    pub emoji_freq: f64,
    pub common_words: Vec<String>,
    /// Horas (0-23) con más actividad, de mayor a menor.
    pub active_hours: Vec<i64>,
    /// Últimos mensajes cortos, como ejemplos de su forma de escribir.
    pub vocab_sample: Vec<String>,
    pub uses_slang: bool,
}

#[derive(Debug, Serialize)]
pub struct GroupStyleProfile {
    pub group_jid: String,
    pub msg_count: i64,
    pub active_users: Vec<String>,
    pub common_words: Vec<String>,
    pub avg_msg_len: f64,
    pub emoji_freq: f64,
    pub vocab_sample: Vec<String>,
}

/// Marcadores de habla informal. Es la misma heurística que tenía trainer.py:
/// no pretende ser un detector de jerga, solo distinguir registro coloquial de
/// formal para que la IA responda en el mismo tono.
const SLANG: [&str; 12] = [
    "jaja", "jeje", "xd", "wtf", "bro", "pana", "chamo", "mano", "weon", "crack", "uwu", "ptm",
];

pub fn user_profile(db: &ConvDb, jid: &str, days: i64) -> Result<UserStyleProfile, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    let cutoff = Utc::now().timestamp_millis() - days * 86_400_000;

    let (msg_count, avg_len, emoji_freq): (i64, f64, f64) = conn
        .query_row(
            "SELECT COUNT(*),
                COALESCE(AVG(len), 0.0),
                COALESCE(AVG(CAST(has_emoji AS REAL)), 0.0)
           FROM conversations WHERE sender = ?1 AND ts > ?2",
            params![jid, cutoff],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )
        .map_err(|e| e.to_string())?;

    let texts: Vec<String> = {
        let mut stmt = conn
            .prepare(
                "SELECT text FROM conversations WHERE sender = ?1 AND ts > ?2
              ORDER BY ts DESC LIMIT 200",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params![jid, cutoff], |r| r.get::<_, String>(0))
            .map_err(|e| e.to_string())?;
        rows.filter_map(Result::ok).collect()
    };

    // Hora local del mensaje a partir del epoch en ms, sin traer una zona
    // horaria: lo que interesa es el patrón relativo, no la hora exacta.
    let active_hours: Vec<i64> = {
        let mut stmt = conn
            .prepare(
                "SELECT CAST((ts / 3600000) % 24 AS INTEGER) AS hora, COUNT(*) AS n
               FROM conversations WHERE sender = ?1 AND ts > ?2
              GROUP BY hora ORDER BY n DESC LIMIT 5",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params![jid, cutoff], |r| r.get::<_, i64>(0))
            .map_err(|e| e.to_string())?;
        rows.filter_map(Result::ok).collect()
    };

    let vocab_sample: Vec<String> = texts
        .iter()
        .filter(|t| t.len() <= SAMPLE_MAX_LEN && !t.is_empty())
        .take(8)
        .cloned()
        .collect();

    let uses_slang = texts.iter().any(|t| {
        let low = t.to_lowercase();
        SLANG.iter().any(|s| low.contains(s))
    });

    Ok(UserStyleProfile {
        jid: jid.to_string(),
        msg_count,
        avg_len,
        emoji_freq,
        common_words: top_words(&texts, 20),
        active_hours,
        vocab_sample,
        uses_slang,
    })
}

pub fn group_profile(db: &ConvDb, gjid: &str, days: i64) -> Result<GroupStyleProfile, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    let cutoff = Utc::now().timestamp_millis() - days * 86_400_000;

    let (msg_count, avg_len, emoji_freq): (i64, f64, f64) = conn
        .query_row(
            "SELECT COUNT(*),
                COALESCE(AVG(len), 0.0),
                COALESCE(AVG(CAST(has_emoji AS REAL)), 0.0)
           FROM conversations WHERE gjid = ?1 AND ts > ?2",
            params![gjid, cutoff],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )
        .map_err(|e| e.to_string())?;

    let active_users: Vec<String> = {
        let mut stmt = conn
            .prepare(
                "SELECT sender, COUNT(*) AS n FROM conversations
              WHERE gjid = ?1 AND ts > ?2
              GROUP BY sender ORDER BY n DESC LIMIT 5",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params![gjid, cutoff], |r| r.get::<_, String>(0))
            .map_err(|e| e.to_string())?;
        rows.filter_map(Result::ok).collect()
    };

    let texts: Vec<String> = {
        let mut stmt = conn
            .prepare(
                "SELECT text FROM conversations WHERE gjid = ?1 AND ts > ?2
              ORDER BY ts DESC LIMIT 300",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params![gjid, cutoff], |r| r.get::<_, String>(0))
            .map_err(|e| e.to_string())?;
        rows.filter_map(Result::ok).collect()
    };

    let vocab_sample: Vec<String> = texts
        .iter()
        .filter(|t| t.len() <= SAMPLE_MAX_LEN && !t.is_empty())
        .take(10)
        .cloned()
        .collect();

    Ok(GroupStyleProfile {
        group_jid: gjid.to_string(),
        msg_count,
        active_users,
        common_words: top_words(&texts, 30),
        avg_msg_len: avg_len,
        emoji_freq,
        vocab_sample,
    })
}

/// Borra todo lo de un usuario — el equivalente de delete_user_data (RGPD).
pub fn delete_user(db: &ConvDb, jid: &str) -> Result<usize, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    let a = conn
        .execute("DELETE FROM conversations WHERE sender = ?1", params![jid])
        .map_err(|e| e.to_string())?;
    let b = conn
        .execute("DELETE FROM user_style WHERE sender = ?1", params![jid])
        .map_err(|e| e.to_string())?;
    Ok(a + b)
}

// ── Handlers HTTP de perfiles ────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct DaysParams {
    pub days: Option<i64>,
}

#[derive(Deserialize)]
pub struct ObserveRequest {
    pub sender: String,
    pub gjid: String,
    pub text: String,
}

/// Guarda un mensaje de grupo observado: lo ENCOLA, y se escribe con el
/// próximo vaciado (ver [`BaseConv`]). Es lo que corre por CADA mensaje de cada
/// grupo, así que es lo que mide `benches/mensaje.rs`.
pub fn observar(db: &BaseConv, req: ObserveRequest) -> usize {
    db.encolar(Observado {
        sender: req.sender,
        gjid: req.gjid,
        text: req.text,
        ts: Utc::now().timestamp_millis(),
    })
}

/// POST /ai/observe — un mensaje de grupo cualquiera, sin intercambio con la IA.
///
/// Es el reemplazo de `/hepein/record`, que escribia el mismo mensaje en
/// Parquet para calcular el mismo perfil de estilo.
///
/// A diferencia de `/ai/learn` NO recalcula `user_style`: ese agregado hace un
/// COUNT/AVG sobre todas las filas del remitente, y aca entra CADA mensaje de
/// CADA grupo, no solo los que la IA contesta. Los perfiles se calculan cuando
/// se piden, que es raro, en vez de en cada mensaje, que es constante.
pub async fn ai_observe(
    State(state): State<AppState>,
    Json(req): Json<ObserveRequest>,
) -> Json<serde_json::Value> {
    // Sin hilo bloqueante ni base: encolar es empujar a un Vec. Si la cola
    // crece mucho entre vaciados —una ráfaga de cientos de grupos—, se vacía
    // ya, sin esperar al segundo.
    if observar(&state.conv_db, req) >= 512 {
        let db = state.conv_db.clone();
        tokio::task::spawn_blocking(move || db.vaciar_pendientes());
    }
    Json(serde_json::json!({ "ok": true }))
}

// ── Lo que se dijo en un grupo (para "¿qué me perdí?") ───────────────────────

/// Un mensaje del corpus, para resumir.
#[derive(Serialize)]
pub struct MensajeReciente {
    pub sender: String,
    pub text: String,
    pub ts: i64,
}

/// Los últimos `limite` mensajes del grupo desde `desde_ts`, del más viejo al
/// más nuevo. Salen del mismo corpus que ya se guarda para el estilo del
/// grupo: no hace falta guardar nada nuevo para poder resumir.
pub fn mensajes_recientes(
    db: &ConvDb,
    gjid: &str,
    limite: usize,
    desde_ts: i64,
) -> Result<Vec<MensajeReciente>, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    let mut st = conn
        .prepare_cached(
            "SELECT sender, text, ts FROM conversations
              WHERE gjid = ?1 AND ts > ?2 AND text <> ''
              ORDER BY ts DESC LIMIT ?3",
        )
        .map_err(|e| e.to_string())?;
    let mut v: Vec<MensajeReciente> = st
        .query_map(params![gjid, desde_ts, limite as i64], |r| {
            Ok(MensajeReciente {
                sender: r.get(0)?,
                text: r.get(1)?,
                ts: r.get(2)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    v.reverse();
    Ok(v)
}

#[derive(Deserialize)]
pub struct RecientesQuery {
    #[serde(default = "cien")]
    pub limit: usize,
    #[serde(default = "veinticuatro")]
    pub hours: i64,
}
fn cien() -> usize {
    100
}
fn veinticuatro() -> i64 {
    24
}

/// GET /ai/group/recent/{gjid}?limit=100&hours=24 — los mensajes recientes del
/// grupo, quién habló cuánto, y de qué se habló (las palabras más usadas).
pub async fn ai_group_recent(
    State(state): State<AppState>,
    Path(gjid): Path<String>,
    Query(q): Query<RecientesQuery>,
) -> Json<serde_json::Value> {
    let db = state.conv_db.clone();
    let limite = q.limit.clamp(1, 500);
    let desde = Utc::now().timestamp_millis() - q.hours.clamp(1, 24 * 7) * 3_600_000;
    let r = tokio::task::spawn_blocking(move || mensajes_recientes(&db, &gjid, limite, desde)).await;
    match r {
        Ok(Ok(msgs)) => {
            let textos: Vec<String> = msgs.iter().map(|m| m.text.clone()).collect();
            let mut por_sender: HashMap<&str, u32> = HashMap::new();
            for m in &msgs {
                *por_sender.entry(m.sender.as_str()).or_insert(0) += 1;
            }
            let mut participantes: Vec<(&str, u32)> = por_sender.into_iter().collect();
            participantes.sort_by(|a, b| b.1.cmp(&a.1).then(a.0.cmp(b.0)));
            Json(serde_json::json!({
                "ok": true,
                "messages": msgs,
                "keywords": top_words(&textos, 8),
                "participants": participantes
                    .iter()
                    .map(|(s, n)| serde_json::json!({ "sender": s, "count": n }))
                    .collect::<Vec<_>>(),
            }))
        }
        Ok(Err(e)) => Json(serde_json::json!({ "ok": false, "error": e })),
        Err(e) => Json(serde_json::json!({ "ok": false, "error": e.to_string() })),
    }
}

/// GET /ai/profile/{jid}
pub async fn ai_profile(
    State(state): State<AppState>,
    Path(jid): Path<String>,
    Query(q): Query<DaysParams>,
) -> Json<serde_json::Value> {
    let days = q.days.unwrap_or(45).clamp(1, 365);
    let conv_db = state.conv_db.clone();

    match tokio::task::spawn_blocking(move || user_profile(&conv_db, &jid, days)).await {
        Ok(Ok(p)) => Json(serde_json::to_value(p).unwrap_or_default()),
        Ok(Err(e)) => Json(serde_json::json!({ "ok": false, "error": e })),
        Err(e) => Json(serde_json::json!({ "ok": false, "error": e.to_string() })),
    }
}

/// GET /ai/group-style/{gjid}
pub async fn ai_group_style(
    State(state): State<AppState>,
    Path(gjid): Path<String>,
    Query(q): Query<DaysParams>,
) -> Json<serde_json::Value> {
    let days = q.days.unwrap_or(30).clamp(1, 365);
    let conv_db = state.conv_db.clone();

    match tokio::task::spawn_blocking(move || group_profile(&conv_db, &gjid, days)).await {
        Ok(Ok(p)) => Json(serde_json::to_value(p).unwrap_or_default()),
        Ok(Err(e)) => Json(serde_json::json!({ "ok": false, "error": e })),
        Err(e) => Json(serde_json::json!({ "ok": false, "error": e.to_string() })),
    }
}

/// DELETE /ai/profile/{jid} — privacidad: borra todo lo del usuario.
pub async fn ai_delete_profile(
    State(state): State<AppState>,
    Path(jid): Path<String>,
) -> Json<serde_json::Value> {
    let conv_db = state.conv_db.clone();
    match tokio::task::spawn_blocking(move || delete_user(&conv_db, &jid)).await {
        Ok(Ok(n)) => Json(serde_json::json!({ "ok": true, "deleted_rows": n })),
        Ok(Err(e)) => Json(serde_json::json!({ "ok": false, "error": e })),
        Err(e) => Json(serde_json::json!({ "ok": false, "error": e.to_string() })),
    }
}

/// GET /ai/corpus/stats — tamaño del corpus de aprendizaje.
pub async fn ai_corpus_stats(State(state): State<AppState>) -> Json<serde_json::Value> {
    let conv_db = state.conv_db.clone();

    let res = tokio::task::spawn_blocking(move || -> Result<_, String> {
        let conn = conv_db.lock().map_err(|e| e.to_string())?;
        let rows: i64 = conn
            .query_row("SELECT COUNT(*) FROM conversations", [], |r| r.get(0))
            .map_err(|e| e.to_string())?;
        let senders: i64 = conn
            .query_row(
                "SELECT COUNT(DISTINCT sender) FROM conversations",
                [],
                |r| r.get(0),
            )
            .map_err(|e| e.to_string())?;
        let groups: i64 = conn
            .query_row(
                "SELECT COUNT(DISTINCT gjid) FROM conversations WHERE gjid <> ''",
                [],
                |r| r.get(0),
            )
            .map_err(|e| e.to_string())?;
        // page_count * page_size es el tamaño real del archivo segun SQLite,
        // sin tener que salir a mirar el filesystem.
        let bytes: i64 = conn
            .query_row(
                "SELECT page_count * page_size FROM pragma_page_count(), pragma_page_size()",
                [],
                |r| r.get(0),
            )
            .unwrap_or(0);
        Ok((rows, senders, groups, bytes))
    })
    .await;

    match res {
        Ok(Ok((rows, senders, groups, bytes))) => Json(serde_json::json!({
            "ok": true, "rows": rows, "senders": senders,
            "groups": groups, "disk_mb": (bytes as f64) / 1_048_576.0,
        })),
        Ok(Err(e)) => Json(serde_json::json!({ "ok": false, "error": e })),
        Err(e) => Json(serde_json::json!({ "ok": false, "error": e.to_string() })),
    }
}

// ── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    fn db_memoria() -> ConvDb {
        let conn = Connection::open_in_memory().expect("sqlite en memoria");
        conn.execute_batch(
            "
            CREATE TABLE conversations (
                id        INTEGER PRIMARY KEY AUTOINCREMENT,
                sender    VARCHAR NOT NULL,
                gjid      VARCHAR NOT NULL DEFAULT '',
                text      VARCHAR NOT NULL,
                intent    VARCHAR NOT NULL DEFAULT 'neutral',
                reply     VARCHAR NOT NULL DEFAULT '',
                mode      VARCHAR NOT NULL DEFAULT 'amable',
                ts        BIGINT  NOT NULL,
                len       INTEGER NOT NULL DEFAULT 0,
                has_emoji INTEGER NOT NULL DEFAULT 0
            );
            CREATE TABLE user_style (
                sender        VARCHAR PRIMARY KEY,
                total_msgs    BIGINT  NOT NULL DEFAULT 0,
                avg_len       REAL    NOT NULL DEFAULT 0.0,
                emoji_freq    REAL    NOT NULL DEFAULT 0.0,
                question_freq REAL    NOT NULL DEFAULT 0.0,
                common_words  VARCHAR NOT NULL DEFAULT '[]',
                updated_at    BIGINT  NOT NULL DEFAULT 0
            );
        ",
        )
        .expect("schema");
        BaseConv::nueva(conn)
    }

    fn insertar(db: &ConvDb, sender: &str, gjid: &str, text: &str, reply: &str, ts: i64) {
        let conn = db.lock().unwrap();
        let has_emoji = text.chars().any(|c| (c as u32) > 0x2500);
        conn.execute(
            "INSERT INTO conversations (sender, gjid, text, intent, reply, mode, ts, len, has_emoji)
             VALUES (?1, ?2, ?3, 'x', ?4, 'x', ?5, ?6, ?7)",
            params![sender, gjid, text, reply, ts, text.len() as i32, has_emoji],
        ).unwrap();
    }

    fn ahora() -> i64 {
        Utc::now().timestamp_millis()
    }

    #[test]
    fn top_words_descarta_las_palabras_vacias() {
        let textos = vec![
            "de la que el para con una cosa".to_string(),
            "cosa cosa".to_string(),
        ];
        let w = top_words(&textos, 10);
        assert_eq!(
            w,
            vec!["cosa"],
            "solo deberia quedar la palabra con contenido"
        );
    }

    #[test]
    fn top_words_ignora_palabras_de_menos_de_tres_letras() {
        // El umbral es >= 3 caracteres: "ok" fuera, "oye" dentro.
        let textos = vec!["ok ok ok oye oye".to_string()];
        assert_eq!(top_words(&textos, 10), vec!["oye"]);
    }

    #[test]
    fn top_words_ordena_por_frecuencia() {
        let textos = vec!["chamba chamba chamba causa causa pana".to_string()];
        assert_eq!(top_words(&textos, 3), vec!["chamba", "causa", "pana"]);
    }

    #[test]
    fn top_words_es_estable_entre_llamadas() {
        // Con empates, sin desempate por palabra el orden del HashMap decidia y
        // el perfil del usuario cambiaba sin que el escribiera nada nuevo.
        let textos = vec!["alfa beta gamma delta epsilon zeta".to_string()];
        let primera = top_words(&textos, 6);
        for _ in 0..50 {
            assert_eq!(top_words(&textos, 6), primera, "el orden no deberia variar");
        }
    }

    #[test]
    fn top_words_respeta_el_tope() {
        let textos = vec!["uno dos tres cuatro cinco seis siete ocho".to_string()];
        assert_eq!(top_words(&textos, 3).len(), 3);
    }

    #[test]
    fn perfil_cuenta_promedia_y_detecta_emojis() {
        let db = db_memoria();
        let t = ahora();
        insertar(&db, "a@s", "g@g", "hola", "", t); // 4 chars, sin emoji
        insertar(&db, "a@s", "g@g", "hola 🙂", "", t - 1_000); // con emoji
        insertar(&db, "b@s", "g@g", "otro", "", t - 2_000); // otro usuario

        let p = user_profile(&db, "a@s", 45).unwrap();
        assert_eq!(
            p.msg_count, 2,
            "no debe contar los mensajes de otro usuario"
        );
        assert_eq!(p.emoji_freq, 0.5);
        assert!(p.avg_len > 4.0);
    }

    #[test]
    fn perfil_detecta_la_jerga() {
        let db = db_memoria();
        insertar(
            &db,
            "a@s",
            "g@g",
            "buenas tardes, saludos cordiales",
            "",
            ahora(),
        );
        assert!(!user_profile(&db, "a@s", 45).unwrap().uses_slang);

        insertar(&db, "a@s", "g@g", "JAJA que chevere", "", ahora());
        assert!(
            user_profile(&db, "a@s", 45).unwrap().uses_slang,
            "la deteccion tiene que ser insensible a mayusculas",
        );
    }

    #[test]
    fn perfil_respeta_la_ventana_de_dias() {
        let db = db_memoria();
        let viejo = ahora() - 60 * 86_400_000; // 60 dias
        insertar(&db, "a@s", "g@g", "mensaje viejo", "", viejo);
        insertar(&db, "a@s", "g@g", "mensaje nuevo", "", ahora());

        assert_eq!(
            user_profile(&db, "a@s", 45).unwrap().msg_count,
            1,
            "45 dias deja fuera el viejo"
        );
        assert_eq!(
            user_profile(&db, "a@s", 90).unwrap().msg_count,
            2,
            "90 dias lo incluye"
        );
    }

    #[test]
    fn perfil_vacio_no_falla() {
        // Es el caso de un usuario nuevo, y el que cubre el borrado por
        // privacidad: tiene que devolver ceros, no un error.
        let p = user_profile(&db_memoria(), "nadie@s", 45).unwrap();
        assert_eq!(p.msg_count, 0);
        assert_eq!(p.avg_len, 0.0);
        assert!(p.common_words.is_empty());
        assert!(p.active_hours.is_empty());
        assert!(!p.uses_slang);
    }

    #[test]
    fn vocab_sample_descarta_los_mensajes_largos() {
        let db = db_memoria();
        let largo = "x".repeat(SAMPLE_MAX_LEN + 1);
        insertar(&db, "a@s", "g@g", &largo, "", ahora());
        insertar(&db, "a@s", "g@g", "corto", "", ahora() - 1_000);

        let p = user_profile(&db, "a@s", 45).unwrap();
        assert_eq!(
            p.vocab_sample,
            vec!["corto"],
            "los ejemplos son para ver el tono, no parrafos"
        );
        assert_eq!(
            p.msg_count, 2,
            "pero el mensaje largo si cuenta para las cifras"
        );
    }

    #[test]
    fn perfil_de_grupo_ordena_los_usuarios_por_actividad() {
        let db = db_memoria();
        let t = ahora();
        for i in 0..5 {
            insertar(&db, "hablador@s", "g1@g", "mensaje", "", t - i * 1_000);
        }
        insertar(&db, "callado@s", "g1@g", "mensaje", "", t);
        insertar(&db, "otro@s", "g2@g", "mensaje", "", t); // otro grupo

        let g = group_profile(&db, "g1@g", 30).unwrap();
        assert_eq!(g.msg_count, 6, "no debe mezclar grupos");
        assert_eq!(g.active_users, vec!["hablador@s", "callado@s"]);
    }

    #[test]
    fn borrado_se_lleva_las_dos_tablas_y_solo_de_ese_usuario() {
        let db = db_memoria();
        insertar(&db, "a@s", "g@g", "uno", "", ahora());
        insertar(&db, "a@s", "g@g", "dos", "", ahora());
        insertar(&db, "b@s", "g@g", "tres", "", ahora());
        {
            let conn = db.lock().unwrap();
            for s in ["a@s", "b@s"] {
                conn.execute("INSERT INTO user_style (sender) VALUES (?1)", params![s])
                    .unwrap();
            }
        }

        assert_eq!(
            delete_user(&db, "a@s").unwrap(),
            3,
            "2 mensajes + 1 fila de estilo"
        );
        assert_eq!(user_profile(&db, "a@s", 45).unwrap().msg_count, 0);
        assert_eq!(
            user_profile(&db, "b@s", 45).unwrap().msg_count,
            1,
            "el otro usuario no se toca"
        );

        let conn = db.lock().unwrap();
        let quedan: i64 = conn
            .query_row("SELECT COUNT(*) FROM user_style", [], |r| r.get(0))
            .unwrap();
        assert_eq!(quedan, 1);
    }

    #[test]
    fn recientes_del_grupo_en_orden_y_dentro_de_la_ventana() {
        let db = db_memoria();
        let t = ahora();
        insertar(&db, "a@s", "g1@g", "viejisimo", "", t - 48 * 3_600_000);
        insertar(&db, "a@s", "g1@g", "primero", "", t - 3_000);
        insertar(&db, "b@s", "g1@g", "segundo", "", t - 2_000);
        insertar(&db, "a@s", "g1@g", "", "", t - 1_500); // sin texto: fuera
        insertar(&db, "c@s", "g2@g", "otro grupo", "", t - 1_000);
        insertar(&db, "b@s", "g1@g", "tercero", "", t);

        let v = mensajes_recientes(&db, "g1@g", 100, t - 24 * 3_600_000).unwrap();
        let textos: Vec<&str> = v.iter().map(|m| m.text.as_str()).collect();
        assert_eq!(
            textos,
            vec!["primero", "segundo", "tercero"],
            "del mas viejo al mas nuevo, sin otros grupos ni fuera de la ventana"
        );
    }

    #[test]
    fn recientes_con_tope_se_queda_con_los_ultimos() {
        let db = db_memoria();
        let t = ahora();
        for i in 0..10 {
            insertar(&db, "a@s", "g@g", &format!("m{i}"), "", t - (10 - i) * 1_000);
        }
        let v = mensajes_recientes(&db, "g@g", 3, 0).unwrap();
        let textos: Vec<&str> = v.iter().map(|m| m.text.as_str()).collect();
        assert_eq!(textos, vec!["m7", "m8", "m9"]);
    }

    #[test]
    fn recientes_ve_lo_que_aun_esta_en_la_cola() {
        // Lo observado va a la cola de escritura diferida; el resumen tiene que
        // verlo igual, porque lock() vacia la cola antes de leer.
        let db = db_memoria();
        let n = observar(
            &db,
            ObserveRequest {
                sender: "a@s".into(),
                gjid: "g@g".into(),
                text: "recien llegado".into(),
            },
        );
        assert!(n >= 1);
        let v = mensajes_recientes(&db, "g@g", 10, 0).unwrap();
        assert_eq!(v.len(), 1);
        assert_eq!(v[0].text, "recien llegado");
    }
}
