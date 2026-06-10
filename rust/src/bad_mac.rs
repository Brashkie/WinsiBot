//! bad_mac.rs — Per-group Bad MAC sliding-window counter.
//!
//! Cada grupo tiene su propio contador independiente.
//! Un grupo con flood NO afecta a los demás.
//! Umbral: BAD_MAC_THRESHOLD eventos en BAD_MAC_WINDOW_SECS → shouldClear = true.
//! Después de triggear, el grupo tiene un cooldown de COOLDOWN_SECS antes de
//! volver a triggear — evita bucles de clear infinitos.

use axum::{extract::State, http::StatusCode, response::Json};
use chrono::Utc;
use serde::Deserialize;
use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};

use crate::routes::AppState;

// ── Configuración ─────────────────────────────────────────────────────────────
const BAD_MAC_THRESHOLD:   u32 = 5;   // eventos por grupo antes de shouldClear
const BAD_MAC_WINDOW_SECS: u64 = 30;  // ventana deslizante (segundos)
const COOLDOWN_SECS:       u64 = 10;  // cooldown mínimo entre clears del mismo grupo

// ── Estado por grupo ──────────────────────────────────────────────────────────
#[derive(Debug)]
struct GroupState {
    count:        u32,
    window_start: Instant,
    cleared_at:   Option<Instant>,
}

impl GroupState {
    fn new() -> Self {
        Self {
            count:        0,
            window_start: Instant::now(),
            cleared_at:   None,
        }
    }
}

// ── Tracker compartido ────────────────────────────────────────────────────────
#[derive(Clone)]
pub struct BadMacTracker {
    inner: Arc<Mutex<HashMap<String, GroupState>>>,
}

impl BadMacTracker {
    pub fn new() -> Self {
        Self {
            inner: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    /// Registra un Bad MAC para `jid`. Devuelve (count, should_clear).
    pub fn report(&self, jid: &str) -> (u32, bool) {
        let mut map = self.inner.lock().unwrap();
        let entry   = map.entry(jid.to_string()).or_insert_with(GroupState::new);
        let now     = Instant::now();

        // Si el último clear fue hace menos de COOLDOWN_SECS, suprimir
        if let Some(cleared) = entry.cleared_at {
            if now.duration_since(cleared) < Duration::from_secs(COOLDOWN_SECS) {
                return (entry.count, false);
            }
        }

        // Resetear ventana si expiró
        if now.duration_since(entry.window_start) > Duration::from_secs(BAD_MAC_WINDOW_SECS) {
            entry.count        = 0;
            entry.window_start = now;
        }

        entry.count += 1;
        let count = entry.count;

        let should_clear = count >= BAD_MAC_THRESHOLD;
        if should_clear {
            tracing::warn!(
                jid      = %jid,
                count    = count,
                threshold = BAD_MAC_THRESHOLD,
                "Bad MAC threshold — señalando clear para este grupo"
            );
            entry.count      = 0;
            entry.cleared_at = Some(now);
        }

        (count, should_clear)
    }

    /// Resetea manualmente el contador de un grupo (p. ej. tras clear manual).
    pub fn reset(&self, jid: &str) {
        let mut map = self.inner.lock().unwrap();
        map.remove(jid);
    }

    /// Devuelve stats de todos los grupos con contadores activos.
    pub fn stats(&self) -> Vec<serde_json::Value> {
        let map = self.inner.lock().unwrap();
        map.iter()
            .filter(|(_, v)| v.count > 0)
            .map(|(jid, v)| {
                serde_json::json!({
                    "jid":   jid,
                    "count": v.count,
                })
            })
            .collect()
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

    let (count, should_clear) = state.bad_mac.report(&body.jid);

    (
        StatusCode::OK,
        Json(serde_json::json!({
            "ok":          true,
            "jid":         body.jid,
            "count":       count,
            "threshold":   BAD_MAC_THRESHOLD,
            "shouldClear": should_clear,
            "ts":          Utc::now(),
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
        "ok":        true,
        "threshold": BAD_MAC_THRESHOLD,
        "window_s":  BAD_MAC_WINDOW_SECS,
        "groups":    groups,
        "ts":        Utc::now(),
    }))
}
