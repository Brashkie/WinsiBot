/// metrics.rs — Contadores atómicos para la API v5.
///
/// Sin Prometheus: sólo AtomicU64 + serde_json.
/// Los handlers principales llaman inc_* explícitamente.
/// Expuesto en GET /metrics (protegido por API key).

use std::{
    sync::{
        atomic::{AtomicU64, Ordering::Relaxed},
        Arc,
    },
    time::Instant,
};

use axum::{extract::State, response::Json};
use chrono::Utc;

use crate::routes::AppState;

// ── Contadores ────────────────────────────────────────────────────────────────

#[derive(Clone, Debug)]
pub struct Metrics {
    inner: Arc<Inner>,
}

#[derive(Debug)]
struct Inner {
    started_at:       Instant,
    writes_total:     AtomicU64,
    reads_total:      AtomicU64,
    bytes_in:         AtomicU64,
    bytes_out:        AtomicU64,
    snapshots_auto:   AtomicU64,
    snapshots_manual: AtomicU64,
    recoveries:       AtomicU64,
    api_errors:       AtomicU64,
}

impl Metrics {
    pub fn new() -> Self {
        Self {
            inner: Arc::new(Inner {
                started_at:       Instant::now(),
                writes_total:     AtomicU64::new(0),
                reads_total:      AtomicU64::new(0),
                bytes_in:         AtomicU64::new(0),
                bytes_out:        AtomicU64::new(0),
                snapshots_auto:   AtomicU64::new(0),
                snapshots_manual: AtomicU64::new(0),
                recoveries:       AtomicU64::new(0),
                api_errors:       AtomicU64::new(0),
            }),
        }
    }

    pub fn inc_write(&self, bytes: usize) {
        self.inner.writes_total.fetch_add(1, Relaxed);
        self.inner.bytes_in.fetch_add(bytes as u64, Relaxed);
    }

    pub fn inc_read(&self, bytes: usize) {
        self.inner.reads_total.fetch_add(1, Relaxed);
        self.inner.bytes_out.fetch_add(bytes as u64, Relaxed);
    }

    pub fn inc_snapshot_auto(&self)   { self.inner.snapshots_auto.fetch_add(1, Relaxed); }
    pub fn inc_snapshot_manual(&self) { self.inner.snapshots_manual.fetch_add(1, Relaxed); }
    pub fn inc_recovery(&self)        { self.inner.recoveries.fetch_add(1, Relaxed); }
    pub fn inc_error(&self)           { self.inner.api_errors.fetch_add(1, Relaxed); }

    pub fn snapshot(&self) -> serde_json::Value {
        let i = &self.inner;
        let bytes_in  = i.bytes_in.load(Relaxed);
        let bytes_out = i.bytes_out.load(Relaxed);
        serde_json::json!({
            "uptimeSecs":      i.started_at.elapsed().as_secs(),
            "writesTotal":     i.writes_total.load(Relaxed),
            "readsTotal":      i.reads_total.load(Relaxed),
            "bytesIn":         bytes_in,
            "bytesOut":        bytes_out,
            "bytesInMB":       format!("{:.2}", bytes_in  as f64 / 1_048_576.0),
            "bytesOutMB":      format!("{:.2}", bytes_out as f64 / 1_048_576.0),
            "snapshotsAuto":   i.snapshots_auto.load(Relaxed),
            "snapshotsManual": i.snapshots_manual.load(Relaxed),
            "recoveries":      i.recoveries.load(Relaxed),
            "apiErrors":       i.api_errors.load(Relaxed),
        })
    }
}

// ── GET /metrics ──────────────────────────────────────────────────────────────

pub async fn get_metrics(State(state): State<AppState>) -> Json<serde_json::Value> {
    Json(serde_json::json!({
        "ok":      true,
        "metrics": state.metrics.snapshot(),
        "ts":      Utc::now(),
    }))
}
