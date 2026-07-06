/// tasks.rs — Tareas de fondo lanzadas con tokio::spawn desde main().
///
///  - auto_snapshot  : cada 5 min toma snapshot de todas las sesiones activas.
///  - cleanup_msgs   : cada 30 min elimina del outbox mensajes de más de 7 días.
///  - cleanup_bots   : cada 10 min elimina subbots muertos/inactivos (>5 min).
///  - watchdog_check : cada 60 s registra advertencia si Node.js no responde.

use std::time::Duration;

use crate::routes::AppState;
use crate::{alerts, db, session_id, snapshot};

const SNAP_INTERVAL_SECS:  u64 = 300;   // 5 min
const CLEANUP_MSG_SECS:    u64 = 1_800; // 30 min
const CLEANUP_BOT_SECS:    u64 = 600;   // 10 min
const WATCHDOG_CHECK_SECS: u64 = 60;    // 1 min

pub fn start(state: AppState) {
    tokio::spawn(auto_snapshot(state.clone()));
    tokio::spawn(cleanup_msgs(state.clone()));
    tokio::spawn(cleanup_bots(state.clone()));
    tokio::spawn(watchdog_check(state));
}

async fn auto_snapshot(state: AppState) {
    let mut timer = tokio::time::interval(Duration::from_secs(SNAP_INTERVAL_SECS));
    timer.tick().await; // saltar el primer tick inmediato
    loop {
        timer.tick().await;
        let sessions = session_id::list_sessions(&state.sessions_dir);
        let total = sessions.len();
        let mut ok = 0u32;

        for sid in &sessions {
            if let Ok(path) = session_id::resolve(&state.sessions_dir, sid) {
                if snapshot::create(&path).is_ok() {
                    state.metrics.inc_snapshot_auto();
                    ok += 1;
                }
            }
        }

        if total > 0 {
            tracing::info!(ok, total, "auto-snapshot completado");
        }
    }
}

async fn cleanup_msgs(state: AppState) {
    let mut timer = tokio::time::interval(Duration::from_secs(CLEANUP_MSG_SECS));
    timer.tick().await;
    loop {
        timer.tick().await;
        let db = state.db.clone();
        match tokio::task::spawn_blocking(move || db::cleanup(&db, 7)).await {
            Ok(Ok(n)) if n > 0 => tracing::info!(deleted = n, "outbox: registros antiguos eliminados (tarea)"),
            Ok(Err(e))         => tracing::warn!(error = %e, "cleanup_msgs: error de DB"),
            _                  => {}
        }
    }
}

async fn cleanup_bots(state: AppState) {
    let mut timer = tokio::time::interval(Duration::from_secs(CLEANUP_BOT_SECS));
    timer.tick().await;
    loop {
        timer.tick().await;
        let removed = state.subbots.cleanup_dead(300);
        if removed > 0 {
            tracing::info!(removed, "subbots inactivos eliminados (tarea)");
        }
    }
}

async fn watchdog_check(state: AppState) {
    let mut timer = tokio::time::interval(Duration::from_secs(WATCHDOG_CHECK_SECS));
    timer.tick().await;
    let mut was_alive = true; // asumimos vivo al iniciar para no alertar en el primer tick

    loop {
        timer.tick().await;
        let st    = state.watchdog.status();
        let alive = st["alive"].as_bool().unwrap_or(true);

        if !alive && was_alive {
            // Transición vivo → muerto
            let secs = st["lastPingSecs"].as_u64().unwrap_or(0);
            tracing::warn!(secs_without_ping = secs, "WATCHDOG MUERTO — Node.js sin respuesta");

            let db = state.db.clone();
            let detail = serde_json::json!({ "lastPingSecs": secs }).to_string();
            tokio::task::spawn_blocking(move || {
                let _ = db::audit_log(&db, "watchdog", "death", Some(&detail));
            });

            alerts::fire(&state, &format!(
                "🔴 WinsiBot: Node.js dejó de responder ({}s sin ping)", secs
            )).await;
        } else if alive && !was_alive {
            // Transición muerto → vivo
            tracing::info!("watchdog: Node.js volvió a responder");

            let db = state.db.clone();
            tokio::task::spawn_blocking(move || {
                let _ = db::audit_log(&db, "watchdog", "recovered", None);
            });

            alerts::fire(&state, "🟢 WinsiBot: Node.js volvió a responder").await;
        }

        was_alive = alive;
    }
}
