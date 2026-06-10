//! watchdog.rs — Heartbeat monitor para el proceso Node.js.
//!
//! Node.js envía POST /watchdog/ping cada 20s.
//! Si pasan más de 90s sin ping → bot_alive = false.
//! GET /watchdog/status expone el estado para monitoreo externo.

use axum::{extract::State, http::StatusCode, response::Json};
use chrono::Utc;
use std::{
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};

use crate::routes::AppState;

const DEAD_THRESHOLD_SECS: u64 = 90; // sin ping → bot muerto

// ── Estado del watchdog ───────────────────────────────────────────────────────
#[derive(Debug, Clone)]
pub struct WatchdogState {
    inner: Arc<Mutex<Inner>>,
}

#[derive(Debug)]
struct Inner {
    last_ping:  Option<Instant>,
    ping_count: u64,
    started_at: Instant,
}

impl WatchdogState {
    pub fn new() -> Self {
        Self {
            inner: Arc::new(Mutex::new(Inner {
                last_ping:  None,
                ping_count: 0,
                started_at: Instant::now(),
            })),
        }
    }

    pub fn ping(&self) {
        let mut s = self.inner.lock().unwrap();
        s.last_ping  = Some(Instant::now());
        s.ping_count += 1;
    }

    /// true si el bot envió ping recientemente
    pub fn is_alive(&self) -> bool {
        let s = self.inner.lock().unwrap();
        match s.last_ping {
            None => false,
            Some(t) => t.elapsed() < Duration::from_secs(DEAD_THRESHOLD_SECS),
        }
    }

    pub fn status(&self) -> serde_json::Value {
        let s = self.inner.lock().unwrap();
        let elapsed_secs = s.last_ping.map(|t| t.elapsed().as_secs());
        let alive = match s.last_ping {
            None    => false,
            Some(t) => t.elapsed() < Duration::from_secs(DEAD_THRESHOLD_SECS),
        };
        serde_json::json!({
            "alive":         alive,
            "lastPingSecs":  elapsed_secs,
            "pingCount":     s.ping_count,
            "uptimeSecs":    s.started_at.elapsed().as_secs(),
            "deadThreshold": DEAD_THRESHOLD_SECS,
        })
    }
}

// ── POST /watchdog/ping ───────────────────────────────────────────────────────
pub async fn ping(State(state): State<AppState>) -> Json<serde_json::Value> {
    state.watchdog.ping();
    Json(serde_json::json!({ "ok": true, "ts": Utc::now() }))
}

// ── GET /watchdog/status ──────────────────────────────────────────────────────
pub async fn status(State(state): State<AppState>) -> (StatusCode, Json<serde_json::Value>) {
    let st      = state.watchdog.status();
    let alive   = st["alive"].as_bool().unwrap_or(false);
    let http_st = if alive { StatusCode::OK } else { StatusCode::SERVICE_UNAVAILABLE };
    (http_st, Json(serde_json::json!({
        "ok": true,
        "watchdog": st,
        "ts": Utc::now(),
    })))
}
