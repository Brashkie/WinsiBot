/// analytics.rs — GET /analytics
///
/// Agrega en una sola respuesta: sesiones activas, stats de mensajes (24h),
/// estado de subbots, watchdog y métricas internas de la API.
/// Pensado para un futuro panel de control sin tener que golpear 5 endpoints.

use axum::{extract::State, response::Json};
use chrono::Utc;

use crate::{db, session_id};
use crate::routes::AppState;

pub async fn analytics(State(state): State<AppState>) -> Json<serde_json::Value> {
    let sessions = session_id::list_sessions(&state.sessions_dir);

    // Delivery stats últimas 24h — operación bloqueante en spawn_blocking
    let db_c = state.db.clone();
    let msg_stats = tokio::task::spawn_blocking(move || db::get_stats(&db_c, 24))
        .await
        .ok()
        .and_then(|r| r.ok());

    let bots    = state.subbots.stats();
    let dog     = state.watchdog.status();
    let metrics = state.metrics.snapshot();

    Json(serde_json::json!({
        "ok": true,
        "ts": Utc::now(),

        "sessions": {
            "active": sessions.len(),
            "ids":    sessions,
        },

        "messages": msg_stats.map(|s| serde_json::json!({
            "last24h":     s.total,
            "sent":        s.sent,
            "delivered":   s.delivered,
            "read":        s.read,
            "failed":      s.failed,
            "deliveryPct": format!("{:.1}", s.delivery_pct),
            "readPct":     format!("{:.1}", s.read_pct),
        })),

        "subbots": {
            "total":         bots.total,
            "connected":     bots.connected,
            "connecting":    bots.connecting,
            "disconnected":  bots.disconnected,
            "failed":        bots.failed,
            "maxCapacity":   bots.max_subbots,
            "msgsHandled":   bots.total_messages_handled,
            "avgUptimeSecs": format!("{:.0}", bots.avg_uptime_seconds),
        },

        "watchdog": dog,
        "api":      metrics,
    }))
}
