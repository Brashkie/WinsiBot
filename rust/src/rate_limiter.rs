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

// ── Estado por sender ─────────────────────────────────────────────────────────
#[derive(Debug)]
struct SenderBucket {
    count:        u32,
    window_start: Instant,
    last_seen:    Instant,
}

impl SenderBucket {
    fn new() -> Self {
        let now = Instant::now();
        Self {
            count:        0,
            window_start: now,
            last_seen:    now,
        }
    }
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

    /// Total de senders rastreados actualmente.
    pub fn tracked_count(&self) -> usize {
        self.inner.len()
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

// ── GET /rate/stats ───────────────────────────────────────────────────────────
pub async fn rate_stats(
    State(state): State<AppState>,
) -> Json<serde_json::Value> {
    let tracked = state.rate_limiter.tracked_count();
    Json(serde_json::json!({
        "ok":           true,
        "trackedSenders": tracked,
        "limit":        RATE_LIMIT,
        "window_s":     WINDOW_SECS,
        "ts":           Utc::now(),
    }))
}
