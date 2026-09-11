//! rate_limiter.rs — Token-bucket rate limiter per sender.
//!
//! Diseñado para 10,000+ grupos con millones de senders únicos.
//! Ventana deslizante: RATE_LIMIT mensajes por WINDOW_SECS por sender.
//! Limpieza automática de entradas inactivas cada CLEANUP_EVERY llamadas.
//! Falla abierto: si el sender no existe, se crea y se permite el primer mensaje.
//!
//! Este es el camino MÁS caliente de todo el proceso: Node llama /rate/check
//! por CADA mensaje de texto de cada usuario no-owner (ver handler.ts), así
//! que en un grupo grande y hablador, este check corre a la misma frecuencia
//! que los mensajes llegan — potencialmente decenas por segundo, de decenas
//! de senders distintos, en simultáneo. Con un único Mutex<HashMap> global,
//! CADA una de esas llamadas serializa detrás de un solo lock, sin importar
//! que sean senders (y por lo tanto entradas del mapa) completamente
//! distintos entre sí — el trabajo real por llamada es de nanosegundos, pero
//! bajo contención real (muchos hilos de tokio pidiendo el mismo lock al
//! mismo tiempo) el costo deja de ser el trabajo en sí y pasa a ser la
//! espera del futex del SO, que no escala linealmente con más núcleos.
//! DashMap resuelve esto particionando el mapa en N shards independientes
//! (uno por núcleo lógico, ver `with_capacity_and_shard_amount` más abajo)
//! — dos senders distintos casi siempre caen en shards distintos y no se
//! bloquean entre sí, que es exactamente el patrón de acceso real acá
//! (muchos usuarios distintos, cada uno tocando solo su propia entrada).

use axum::{extract::State, http::StatusCode, response::Json};
use chrono::Utc;
use dashmap::DashMap;
use serde::Deserialize;
use std::{
    sync::{
        atomic::{AtomicU32, Ordering},
        Arc,
    },
    time::{Duration, Instant},
};

use crate::routes::AppState;

// ── Configuración ─────────────────────────────────────────────────────────────
const RATE_LIMIT:    u32 = 15;      // mensajes permitidos por ventana
const WINDOW_SECS:   u64 = 10;     // tamaño de ventana en segundos
const CLEANUP_EVERY: u32 = 5_000;  // limpiar entradas inactivas cada N calls
const INACTIVE_SECS: u64 = 120;    // tiempo sin actividad para considerar inactivo

// ── SpamGuard: lo que venía del C de Python ──────────────────────────────────
// python/cython_ext/spam_guard.c hacía casi lo mismo que este rate limiter
// (ventana deslizante por sender) y encima dos cosas que acá faltaban: bloqueo
// progresivo al reincidir y detección de texto repetido. Node llamaba a los
// DOS en cada comando — a Rust por /rate/check y a Python por /spam/check —,
// o sea dos round-trips HTTP para responder casi la misma pregunta. Absorbido
// acá: una sola llamada, y Python sale del camino crítico.
const BLOCK_DURATIONS_MS: [u64; 3] = [5_000, 15_000, 60_000];
const MAX_REPEAT_TRACK:   usize    = 8;

/// Motivo del bloqueo — mismo contrato que devolvía Python, para que el
/// middleware de Node no tenga que cambiar cómo lo interpreta.
#[derive(Debug, Clone, Copy, PartialEq, serde::Serialize)]
#[serde(rename_all = "snake_case")]
pub enum SpamReason {
    Ok,
    RateLimit,
    Blocked,
    Flood,
}

// ── Estado por sender ─────────────────────────────────────────────────────────
#[derive(Debug)]
struct SenderBucket {
    count:         u32,
    window_start:  Instant,
    last_seen:     Instant,
    /// Contador propio de spam_check, SEPARADO del de check(): los dos miden
    /// frecuencia pero con ventanas distintas (10s contra 5s) y ámbitos
    /// distintos (todo mensaje contra solo comandos). Compartiendo un único
    /// contador, cada llamada a uno falsearía al otro — un usuario que manda
    /// mensajes normales agotaría el presupuesto de comandos y al revés.
    spam_count:    u32,
    spam_window:   Instant,
    /// Reincidencias: cada bloqueo sube el siguiente castigo (5s → 15s → 60s).
    warn_count:    u32,
    blocked_until: Option<Instant>,
    /// Últimos textos con su conteo, para detectar repetición. Un Vec corto y
    /// lineal le gana a un HashMap con 8 elementos y no asigna por mensaje.
    recent:        Vec<(u64, u32, Instant)>,   // (hash del texto, veces, visto)
}

impl SenderBucket {
    fn new() -> Self {
        let now = Instant::now();
        Self {
            count:         0,
            window_start:  now,
            last_seen:     now,
            spam_count:    0,
            spam_window:   now,
            warn_count:    0,
            blocked_until: None,
            recent:        Vec::new(),
        }
    }
}

/// Hash barato y estable del texto — no hace falta resistencia a colisiones,
/// solo distinguir "mandó lo mismo otra vez" de "mandó algo distinto".
fn text_hash(s: &str) -> u64 {
    let mut h: u64 = 5381;
    for b in s.as_bytes().iter().take(512) {
        h = h.wrapping_mul(33) ^ (*b as u64);
    }
    h
}

// ── Rate limiter compartido ───────────────────────────────────────────────────
#[derive(Clone)]
pub struct RateLimiter {
    inner:      Arc<DashMap<String, SenderBucket>>,
    call_count: Arc<AtomicU32>,
}

impl RateLimiter {
    pub fn new() -> Self {
        // Un shard por núcleo lógico (potencia de 2, DashMap lo exige) — con
        // más shards, dos senders random tienen menos probabilidad de caer
        // en el mismo shard y bloquearse entre sí bajo carga concurrente.
        let shards = std::thread::available_parallelism()
            .map(|n| n.get())
            .unwrap_or(4)
            .max(16)
            .next_power_of_two();

        Self {
            inner:      Arc::new(DashMap::with_capacity_and_shard_amount(1024, shards)),
            call_count: Arc::new(AtomicU32::new(0)),
        }
    }

    /// Verifica si `sender` puede enviar un mensaje.
    /// Devuelve (allowed, remaining, reset_ms).
    pub fn check(&self, sender: &str) -> (bool, u32, u64) {
        let calls = self.call_count.fetch_add(1, Ordering::Relaxed);
        let now   = Instant::now();

        // Limpieza periódica — evita que el mapa crezca sin límite. retain()
        // de DashMap toma los locks de shard uno a la vez, nunca todo el
        // mapa de golpe, así que no bloquea checks concurrentes de otros
        // senders mientras barre.
        if calls % CLEANUP_EVERY == 0 {
            self.inner.retain(|_, v| {
                now.duration_since(v.last_seen) < Duration::from_secs(INACTIVE_SECS)
            });
            tracing::debug!(entries = self.inner.len(), "rate_limiter: limpieza periódica");
        }

        let mut entry = self.inner.entry(sender.to_string()).or_insert_with(SenderBucket::new);
        entry.last_seen = now;

        // Resetear ventana si expiró
        if now.duration_since(entry.window_start) > Duration::from_secs(WINDOW_SECS) {
            entry.count        = 0;
            entry.window_start = now;
        }

        entry.count += 1;
        let count        = entry.count;
        let window_start = entry.window_start;
        drop(entry); // soltar el lock del shard antes de seguir — ya no hace falta

        let allowed   = count <= RATE_LIMIT;
        let remaining = RATE_LIMIT.saturating_sub(count);
        let elapsed   = now.duration_since(window_start);
        let reset_ms  = Duration::from_secs(WINDOW_SECS)
            .saturating_sub(elapsed)
            .as_millis() as u64;

        if !allowed {
            tracing::debug!(
                sender    = %sender,
                count     = count,
                limit     = RATE_LIMIT,
                "rate limit excedido"
            );
        }

        (allowed, remaining, reset_ms)
    }

    /// Check combinado: ventana deslizante + bloqueo progresivo + texto
    /// repetido. Reemplaza a /api/v1/spam/check de Python (que envolvía
    /// spam_guard.c) y devuelve el mismo contrato: (permitido, motivo,
    /// cooldown_ms).
    ///
    /// Los parámetros los manda Node como antes, en vez de fijarlos acá, para
    /// no cambiar el comportamiento afinado que ya tenía el middleware.
    pub fn spam_check(
        &self,
        sender:          &str,
        text:            &str,
        max_hits:        u32,
        window_ms:       u64,
        max_repeats:     u32,
        flood_window_ms: u64,
    ) -> (bool, SpamReason, u64) {
        let now = Instant::now();
        let mut entry = self.inner.entry(sender.to_string()).or_insert_with(SenderBucket::new);
        entry.last_seen = now;

        // 1. ¿Sigue castigado de antes?
        if let Some(until) = entry.blocked_until {
            if until > now {
                return (false, SpamReason::Blocked, until.duration_since(now).as_millis() as u64);
            }
            entry.blocked_until = None;
        }

        // 2. Texto repetido. Se mira ANTES de contar el mensaje: repetir lo
        //    mismo 5 veces es flood aunque no llegue al límite de frecuencia.
        if !text.is_empty() {
            let h      = text_hash(text);
            let cutoff = Duration::from_millis(flood_window_ms);
            entry.recent.retain(|(_, _, seen)| now.duration_since(*seen) < cutoff);

            if let Some(slot) = entry.recent.iter_mut().find(|(hh, _, _)| *hh == h) {
                slot.1 += 1;
                slot.2  = now;
                if slot.1 > max_repeats {
                    entry.warn_count += 1;
                    let idx  = (entry.warn_count as usize - 1).min(BLOCK_DURATIONS_MS.len() - 1);
                    let dur  = Duration::from_millis(BLOCK_DURATIONS_MS[idx]);
                    entry.blocked_until = Some(now + dur);
                    return (false, SpamReason::Flood, dur.as_millis() as u64);
                }
            } else {
                if entry.recent.len() >= MAX_REPEAT_TRACK { entry.recent.remove(0); }
                entry.recent.push((h, 1, now));
            }
        }

        // 3. Frecuencia, con su propia ventana y su propio contador — ver el
        //    comentario de spam_count en SenderBucket.
        if now.duration_since(entry.spam_window) > Duration::from_millis(window_ms) {
            entry.spam_count  = 0;
            entry.spam_window = now;
        }
        entry.spam_count += 1;

        if entry.spam_count > max_hits {
            entry.warn_count += 1;
            let idx = (entry.warn_count as usize - 1).min(BLOCK_DURATIONS_MS.len() - 1);
            let dur = Duration::from_millis(BLOCK_DURATIONS_MS[idx]);
            entry.blocked_until = Some(now + dur);
            return (false, SpamReason::RateLimit, dur.as_millis() as u64);
        }

        (true, SpamReason::Ok, 0)
    }
}

// ── Request body ──────────────────────────────────────────────────────────────
#[derive(Deserialize)]
pub struct RateCheckBody {
    pub sender: String,
}

// ── POST /rate/check ──────────────────────────────────────────────────────────
pub async fn rate_check(
    State(state): State<AppState>,
    Json(body):   Json<RateCheckBody>,
) -> (StatusCode, Json<serde_json::Value>) {
    if body.sender.is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "ok": false, "error": "sender requerido" })),
        );
    }

    let (allowed, remaining, reset_ms) = state.rate_limiter.check(&body.sender);

    let status = if allowed {
        StatusCode::OK
    } else {
        StatusCode::TOO_MANY_REQUESTS
    };

    (
        status,
        Json(serde_json::json!({
            "ok":        true,
            "allowed":   allowed,
            "remaining": remaining,
            "reset_ms":  reset_ms,
            "limit":     RATE_LIMIT,
            "window_s":  WINDOW_SECS,
            "ts":        Utc::now(),
        })),
    )
}


// ── Request body de /spam/check ───────────────────────────────────────────────
// Los defaults replican los que Node venía mandando a Python (ver
// spamGuardCheck en plugins/middlewares/rateLimit.ts), para que el
// comportamiento no cambie al mover el check de un servicio al otro.
#[derive(Deserialize)]
pub struct SpamCheckBody {
    pub sender: String,
    #[serde(default)]
    pub text: String,
    #[serde(default = "d_max_hits")]
    pub max_hits: u32,
    #[serde(default = "d_window_ms")]
    pub window_ms: u64,
    #[serde(default = "d_max_repeats")]
    pub max_repeats: u32,
    #[serde(default = "d_flood_window_ms")]
    pub flood_window_ms: u64,
}

fn d_max_hits() -> u32 { 8 }
fn d_window_ms() -> u64 { 5_000 }
fn d_max_repeats() -> u32 { 3 }
fn d_flood_window_ms() -> u64 { 30_000 }

// ── POST /spam/check ──────────────────────────────────────────────────────────
// Sustituye a /api/v1/spam/check de Python. Devuelve 200 SIEMPRE, incluso al
// bloquear: a diferencia de /rate/check —que devuelve 429 a propósito— acá un
// bloqueo es una respuesta de negocio normal, y el circuit breaker del lado de
// Node no debe verlo como que el servicio falla.
pub async fn spam_check(
    State(state): State<AppState>,
    Json(body):   Json<SpamCheckBody>,
) -> (StatusCode, Json<serde_json::Value>) {
    if body.sender.is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "ok": false, "error": "sender requerido" })),
        );
    }

    let (allowed, reason, cooldown_ms) = state.rate_limiter.spam_check(
        &body.sender,
        &body.text,
        body.max_hits,
        body.window_ms,
        body.max_repeats,
        body.flood_window_ms,
    );

    if !allowed {
        tracing::debug!(sender = %body.sender, ?reason, cooldown_ms, "spam_check bloqueó");
    }

    (
        StatusCode::OK,
        Json(serde_json::json!({
            "ok":          true,
            "allowed":     allowed,
            "reason":      reason,
            "cooldown_ms": cooldown_ms,
        })),
    )
}
