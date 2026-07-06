/// routes.rs v4
/// - write: adquiere lock por sessionId antes de escribir
/// - is_healthy: respuesta enriquecida (corruptionDetected, lastSnapshot)
/// - liveness / readiness: para Docker/K8s
/// - messages/track, messages/ack, messages/pending, messages/stats, messages/cleanup

use axum::{
    extract::{Query, State},
    http::StatusCode,
    response::Json,
};
use base64::{engine::general_purpose::STANDARD as B64, Engine as _};
use chrono::Utc;
use serde::{Deserialize, Serialize};

use crate::{alerts, atomic, bad_mac, db, metrics, rate_limiter, session_id, snapshot, subbots, watchdog};

// ── AppState ──────────────────────────────────────────────────────────────────

use crate::lock_manager::LockManager;
use std::sync::Arc;

#[derive(Clone)]
pub struct AppState {
    pub sessions_dir:  String,
    pub auth_dir:      String,
    pub locks:         LockManager,
    pub db:            db::Db,
    pub conv_db_path:  String,
    pub bad_mac:       bad_mac::BadMacTracker,
    pub rate_limiter:  rate_limiter::RateLimiter,
    pub watchdog:      watchdog::WatchdogState,
    pub subbots:       Arc<subbots::SubBotManager>,
    pub metrics:       metrics::Metrics,
    pub alert_webhook_url: Option<String>,
}

// ── Límites de seguridad ──────────────────────────────────────────────────────
const MAX_SESSION_BYTES: usize = 10_000_000; // 10 MB por sesión
const MAX_BATCH:         usize = 1_000;       // items por request de track/ack

// ── Helpers ───────────────────────────────────────────────────────────────────

fn ok(msg: impl Into<String>) -> Json<serde_json::Value> {
    Json(serde_json::json!({ "ok": true, "message": msg.into(), "ts": Utc::now() }))
}

fn err(
    status: StatusCode,
    msg: impl Into<String>,
) -> (StatusCode, Json<serde_json::Value>) {
    let msg = msg.into();
    tracing::warn!(error = %msg, status = %status.as_u16(), "request fallido");
    (status, Json(serde_json::json!({ "ok": false, "error": msg, "ts": Utc::now() })))
}

fn resolve_path(
    sessions_dir: &str,
    sid: &str,
) -> Result<std::path::PathBuf, (StatusCode, Json<serde_json::Value>)> {
    session_id::resolve(sessions_dir, sid)
        .map_err(|e| err(StatusCode::BAD_REQUEST, e.to_string()))
}

// ── GET /health (público) ─────────────────────────────────────────────────────

pub async fn health(State(state): State<AppState>) -> Json<serde_json::Value> {
    let sessions = session_id::list_sessions(&state.sessions_dir);
    tracing::debug!(active_sessions = sessions.len(), "health check");
    Json(serde_json::json!({
        "ok":            true,
        "service":       "winsibot-session-api",
        "version":       "4.0.0",
        "activeSessions": sessions.len(),
        "sessions":      sessions,
        "locksInMemory": state.locks.active_count(),
        "ts":            Utc::now(),
    }))
}

// ── GET /health/live (público) — proceso vivo ─────────────────────────────────

pub async fn liveness() -> Json<serde_json::Value> {
    Json(serde_json::json!({ "ok": true, "status": "alive", "ts": Utc::now() }))
}

// ── GET /health/ready (público) — sessiones_dir accesible ────────────────────

pub async fn readiness(State(state): State<AppState>) -> Json<serde_json::Value> {
    let ready = std::fs::metadata(&state.sessions_dir).is_ok();
    let status = if ready { "ready" } else { "not_ready" };
    tracing::debug!(ready, "readiness check");
    Json(serde_json::json!({
        "ok":           ready,
        "status":       status,
        "sessionsDir":  state.sessions_dir,
        "ts":           Utc::now(),
    }))
}

// ── GET /sessions ─────────────────────────────────────────────────────────────

pub async fn list_sessions(State(state): State<AppState>) -> Json<serde_json::Value> {
    let sessions = session_id::list_sessions(&state.sessions_dir);
    tracing::info!(count = sessions.len(), "listando sesiones");
    Json(serde_json::json!({ "ok": true, "sessions": sessions, "ts": Utc::now() }))
}

// ── POST /write ───────────────────────────────────────────────────────────────
// Body: { "sessionId": "bot1", "data": "<base64>" }

#[derive(Deserialize)]
pub struct WriteBody {
    #[serde(rename = "sessionId")]
    session_id: String,
    data: String,
}

pub async fn write(
    State(state): State<AppState>,
    Json(body): Json<WriteBody>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    let path = resolve_path(&state.sessions_dir, &body.session_id)?;

    // Adquirir lock por sessionId — serializa escrituras concurrentes
    let lock   = state.locks.get(&body.session_id);
    let _guard = lock.lock().await;

    let bytes = B64
        .decode(&body.data)
        .map_err(|e| err(StatusCode::BAD_REQUEST, format!("base64 inválido: {e}")))?;

    if bytes.len() > MAX_SESSION_BYTES {
        return Err(err(
            StatusCode::PAYLOAD_TOO_LARGE,
            format!("datos demasiado grandes ({} bytes, máx {})", bytes.len(), MAX_SESSION_BYTES),
        ));
    }

    // Validar JSON antes de tocar disco
    serde_json::from_slice::<serde_json::Value>(&bytes)
        .map_err(|e| err(StatusCode::BAD_REQUEST, format!("data no es JSON válido: {e}")))?;

    // Snapshot del estado anterior
    let _ = snapshot::create(&path);

    // Escritura atómica
    if let Err(e) = atomic::atomic_write(&path, &bytes) {
        alerts::fire(
            &state,
            &format!("🔴 WinsiBot: fallo al escribir sesión '{}': {e}", body.session_id),
        ).await;
        return Err(err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()));
    }

    state.metrics.inc_write(bytes.len());
    tracing::info!(session = %body.session_id, bytes = bytes.len(), "sesión guardada");
    Ok(ok(format!("sesión '{}' guardada ({} bytes)", body.session_id, bytes.len())))
}

// ── GET /read?sessionId=bot1 ──────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct SessionQuery {
    #[serde(rename = "sessionId")]
    session_id: String,
}

#[derive(Serialize)]
pub struct ReadResponse {
    ok:           bool,
    #[serde(rename = "sessionId")]
    session_id:   String,
    data:         String,
    healthy:      bool,
    ts:           chrono::DateTime<Utc>,
}

pub async fn read(
    State(state): State<AppState>,
    Query(q): Query<SessionQuery>,
) -> Result<Json<ReadResponse>, (StatusCode, Json<serde_json::Value>)> {
    let path = resolve_path(&state.sessions_dir, &q.session_id)?;

    let bytes = std::fs::read(&path).map_err(|e| {
        tracing::warn!(session = %q.session_id, error = %e, "sesión no encontrada");
        err(StatusCode::NOT_FOUND, format!("sesión '{}' no encontrada", q.session_id))
    })?;

    let healthy = serde_json::from_slice::<serde_json::Value>(&bytes).is_ok();
    state.metrics.inc_read(bytes.len());
    tracing::info!(session = %q.session_id, healthy, "sesión leída");

    Ok(Json(ReadResponse {
        ok: true,
        session_id: q.session_id,
        data: B64.encode(&bytes),
        healthy,
        ts: Utc::now(),
    }))
}

// ── POST /snapshot ────────────────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct SessionBody {
    #[serde(rename = "sessionId")]
    session_id: String,
}

pub async fn snapshot_route(
    State(state): State<AppState>,
    Json(body): Json<SessionBody>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    let path = resolve_path(&state.sessions_dir, &body.session_id)?;

    snapshot::create(&path)
        .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    state.metrics.inc_snapshot_manual();
    tracing::info!(session = %body.session_id, "snapshot manual creado");
    Ok(ok(format!("snapshot creado para '{}'", body.session_id)))
}

// ── POST /recover ─────────────────────────────────────────────────────────────

pub async fn recover(
    State(state): State<AppState>,
    Json(body): Json<SessionBody>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    let path = resolve_path(&state.sessions_dir, &body.session_id)?;

    match snapshot::recover(&path) {
        Some(msg) => {
            state.metrics.inc_recovery();
            tracing::info!(session = %body.session_id, from = %msg, "sesión recuperada");
            Ok(ok(format!("'{}' recuperado desde {msg}", body.session_id)))
        }
        None => Err(err(
            StatusCode::NOT_FOUND,
            format!("no hay snapshots válidos para '{}'", body.session_id),
        )),
    }
}

// ── GET /snapshots?sessionId=bot1 ─────────────────────────────────────────────

pub async fn list_snapshots(
    State(state): State<AppState>,
    Query(q): Query<SessionQuery>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    let path = resolve_path(&state.sessions_dir, &q.session_id)?;
    let list = snapshot::list(&path);
    tracing::debug!(session = %q.session_id, count = list.len(), "snapshots listados");
    Ok(Json(serde_json::json!({
        "ok":       true,
        "sessionId": q.session_id,
        "snapshots": list,
        "ts":       Utc::now(),
    })))
}

// ── GET /healthy?sessionId=bot1 ───────────────────────────────────────────────

pub async fn is_healthy(
    State(state): State<AppState>,
    Query(q): Query<SessionQuery>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    let path = resolve_path(&state.sessions_dir, &q.session_id)?;
    let healthy      = atomic::is_healthy(&path);
    let last_snapshot = snapshot::latest_meta(&path);

    tracing::debug!(session = %q.session_id, healthy, "health check de sesión");

    Ok(Json(serde_json::json!({
        "ok":                true,
        "sessionId":         q.session_id,
        "healthy":           healthy,
        "corruptionDetected": !healthy,
        "lastSnapshot":      last_snapshot,
        "ts":                Utc::now(),
    })))
}

// ── GET /sessions/backup?sessionId=main ──────────────────────────────────────
// Lee el backup actual (sessions/main.json) sin restaurar nada.
// Si está corrupto, devuelve el primer snapshot válido.
// Usado por authVerifier para recuperar creds.json sin QR.

pub async fn read_backup(
    State(state): State<AppState>,
    Query(q):     Query<SessionQuery>,
) -> (StatusCode, Json<serde_json::Value>) {
    let path = match resolve_path(&state.sessions_dir, &q.session_id) {
        Ok(p)  => p,
        Err(e) => return e,
    };

    // 1. Intentar el backup actual
    if let Ok(bytes) = std::fs::read(&path) {
        if serde_json::from_slice::<serde_json::Value>(&bytes).is_ok() {
            tracing::debug!(session = %q.session_id, "read_backup desde archivo principal");
            return (StatusCode::OK, Json(serde_json::json!({
                "ok":     true,
                "source": "current",
                "index":  0,
                "data":   B64.encode(&bytes),
                "ts":     Utc::now(),
            })));
        }
    }

    // 2. Buscar el mejor snapshot sin sobreescribir nada
    match snapshot::read_best_valid(&path) {
        Some((bytes, idx)) => {
            tracing::info!(session = %q.session_id, index = idx, "read_backup desde snapshot");
            (StatusCode::OK, Json(serde_json::json!({
                "ok":     true,
                "source": "snapshot",
                "index":  idx,
                "data":   B64.encode(&bytes),
                "ts":     Utc::now(),
            })))
        }
        None => {
            tracing::warn!(session = %q.session_id, "read_backup — sin backup válido");
            (StatusCode::NOT_FOUND, Json(serde_json::json!({
                "ok":    false,
                "error": "sin backup disponible — se requiere nuevo QR",
                "ts":    Utc::now(),
            })))
        }
    }
}

// ── POST /sessions/signal/clear ───────────────────────────────────────────────
// Elimina session-*.json y sender-key-*.json del auth_dir de Baileys.
// Usar cuando se detecta Bad MAC flood para forzar re-establecimiento del protocolo Signal.

pub async fn clear_signal_sessions(
    State(state): State<AppState>,
) -> Json<serde_json::Value> {
    let auth_path = std::path::Path::new(&state.auth_dir);

    if !auth_path.exists() {
        tracing::warn!(auth_dir = %state.auth_dir, "auth_dir no existe");
        return Json(serde_json::json!({
            "ok":     false,
            "error":  "auth_dir no existe",
            "deleted": 0,
            "ts":     Utc::now(),
        }));
    }

    let entries = match std::fs::read_dir(auth_path) {
        Ok(e)  => e,
        Err(e) => {
            tracing::error!(error = %e, "no se pudo leer auth_dir");
            return Json(serde_json::json!({
                "ok":     false,
                "error":  format!("no se pudo leer auth_dir: {e}"),
                "deleted": 0,
                "ts":     Utc::now(),
            }));
        }
    };

    let mut deleted_files: Vec<String> = Vec::new();
    let mut errors: Vec<String> = Vec::new();

    for entry in entries.flatten() {
        let name = entry.file_name();
        let name_str = name.to_string_lossy();

        let is_signal_file = (name_str.starts_with("session-") && name_str.ends_with(".json"))
            || (name_str.starts_with("sender-key-") && name_str.ends_with(".json"));

        if !is_signal_file {
            continue;
        }

        match std::fs::remove_file(entry.path()) {
            Ok(_) => {
                tracing::info!(file = %name_str, "archivo Signal eliminado");
                deleted_files.push(name_str.to_string());
            }
            Err(e) => {
                tracing::warn!(file = %name_str, error = %e, "no se pudo eliminar");
                errors.push(format!("{name_str}: {e}"));
            }
        }
    }

    tracing::info!(
        deleted = deleted_files.len(),
        errors  = errors.len(),
        "clear_signal_sessions completado"
    );

    Json(serde_json::json!({
        "ok":      true,
        "deleted": deleted_files.len(),
        "files":   deleted_files,
        "errors":  errors,
        "ts":      Utc::now(),
    }))
}

// ── POST /messages/track ──────────────────────────────────────────────────────
// Body: [{ "id": "...", "jid": "...", "msg_type": "text", "ts": 1234567890 }, ...]

#[derive(Deserialize)]
pub struct TrackBody {
    messages: Vec<db::TrackItem>,
}

pub async fn messages_track(
    State(state): State<AppState>,
    Json(body): Json<TrackBody>,
) -> (StatusCode, Json<serde_json::Value>) {
    if body.messages.is_empty() {
        return (StatusCode::BAD_REQUEST, Json(serde_json::json!({ "ok": false, "error": "lista vacía" })));
    }
    if body.messages.len() > MAX_BATCH {
        return (StatusCode::BAD_REQUEST, Json(serde_json::json!({
            "ok": false,
            "error": format!("lote demasiado grande ({} items, máx {})", body.messages.len(), MAX_BATCH),
        })));
    }
    let db = state.db.clone();
    match tokio::task::spawn_blocking(move || db::track(&db, &body.messages)).await {
        Ok(Ok(n)) => (StatusCode::OK, Json(serde_json::json!({ "ok": true, "tracked": n, "ts": Utc::now() }))),
        Ok(Err(e)) => {
            tracing::error!(error = %e, "messages_track DB error");
            (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({ "ok": false, "error": e.to_string() })))
        }
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({ "ok": false, "error": e.to_string() }))),
    }
}

// ── POST /messages/ack ────────────────────────────────────────────────────────
// Body: [{ "id": "...", "status": 1 }, ...]
// status: 0=enviado, 1=entregado, 2=leido, 3=reproducido, -1=fallido

#[derive(Deserialize)]
pub struct AckBody {
    updates: Vec<db::AckItem>,
}

pub async fn messages_ack(
    State(state): State<AppState>,
    Json(body): Json<AckBody>,
) -> (StatusCode, Json<serde_json::Value>) {
    if body.updates.is_empty() {
        return (StatusCode::BAD_REQUEST, Json(serde_json::json!({ "ok": false, "error": "lista vacía" })));
    }
    if body.updates.len() > MAX_BATCH {
        return (StatusCode::BAD_REQUEST, Json(serde_json::json!({
            "ok": false,
            "error": format!("lote demasiado grande ({} items, máx {})", body.updates.len(), MAX_BATCH),
        })));
    }
    let db = state.db.clone();
    match tokio::task::spawn_blocking(move || db::ack(&db, &body.updates)).await {
        Ok(Ok(n)) => (StatusCode::OK, Json(serde_json::json!({ "ok": true, "updated": n, "ts": Utc::now() }))),
        Ok(Err(e)) => {
            tracing::error!(error = %e, "messages_ack DB error");
            (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({ "ok": false, "error": e.to_string() })))
        }
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({ "ok": false, "error": e.to_string() }))),
    }
}

// ── GET /messages/pending?minutes=5&limit=100 ─────────────────────────────────
// Mensajes enviados hace >N minutos que no tienen confirmación de entrega.

#[derive(Deserialize)]
pub struct PendingQuery {
    #[serde(default = "default_minutes")]
    minutes: i64,
    #[serde(default = "default_limit")]
    limit:   i64,
}
fn default_minutes() -> i64 { 5  }
fn default_limit()   -> i64 { 100 }

pub async fn messages_pending(
    State(state): State<AppState>,
    Query(q): Query<PendingQuery>,
) -> (StatusCode, Json<serde_json::Value>) {
    let minutes = q.minutes.clamp(1, 10_080); // 1 min – 7 días
    let limit   = q.limit.clamp(1, 10_000);
    let db      = state.db.clone();
    let min_age = minutes * 60;
    match tokio::task::spawn_blocking(move || db::get_pending(&db, min_age, limit)).await {
        Ok(Ok(list)) => (StatusCode::OK, Json(serde_json::json!({
            "ok":      true,
            "count":   list.len(),
            "minutes": minutes,
            "pending": list,
            "ts":      Utc::now(),
        }))),
        Ok(Err(e)) => (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({ "ok": false, "error": e.to_string() }))),
        Err(e)     => (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({ "ok": false, "error": e.to_string() }))),
    }
}

// ── GET /messages/stats?hours=24 ─────────────────────────────────────────────

#[derive(Deserialize)]
pub struct StatsQuery {
    #[serde(default = "default_hours")]
    hours: i64,
}
fn default_hours() -> i64 { 24 }

pub async fn messages_stats(
    State(state): State<AppState>,
    Query(q): Query<StatsQuery>,
) -> (StatusCode, Json<serde_json::Value>) {
    let hours = q.hours.clamp(1, 8_760); // 1 hora – 1 año
    let db    = state.db.clone();
    match tokio::task::spawn_blocking(move || db::get_stats(&db, hours)).await {
        Ok(Ok(s)) => (StatusCode::OK, Json(serde_json::json!({
            "ok":           true,
            "hours":        hours,
            "total":        s.total,
            "sent":         s.sent,
            "delivered":    s.delivered,
            "read":         s.read,
            "failed":       s.failed,
            "delivery_pct": format!("{:.1}", s.delivery_pct),
            "read_pct":     format!("{:.1}", s.read_pct),
            "ts":           Utc::now(),
        }))),
        Ok(Err(e)) => (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({ "ok": false, "error": e.to_string() }))),
        Err(e)     => (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({ "ok": false, "error": e.to_string() }))),
    }
}

// ── DELETE /messages/cleanup?days=7 ──────────────────────────────────────────

#[derive(Deserialize)]
pub struct CleanupQuery {
    #[serde(default = "default_days")]
    days: i64,
}
fn default_days() -> i64 { 7 }

pub async fn messages_cleanup(
    State(state): State<AppState>,
    Query(q): Query<CleanupQuery>,
) -> (StatusCode, Json<serde_json::Value>) {
    let days = q.days.clamp(1, 3_650); // 1 día – 10 años
    let db   = state.db.clone();
    match tokio::task::spawn_blocking(move || db::cleanup(&db, days)).await {
        Ok(Ok(n)) => (StatusCode::OK, Json(serde_json::json!({ "ok": true, "deleted": n, "days": days, "ts": Utc::now() }))),
        Ok(Err(e)) => (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({ "ok": false, "error": e.to_string() }))),
        Err(e)     => (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({ "ok": false, "error": e.to_string() }))),
    }
}

// ── GET /audit?limit=100&category=subbot ─────────────────────────────────────

#[derive(Deserialize)]
pub struct AuditQuery {
    #[serde(default = "default_audit_limit")]
    limit:    i64,
    category: Option<String>,
}
fn default_audit_limit() -> i64 { 100 }

pub async fn get_audit(
    State(state): State<AppState>,
    Query(q): Query<AuditQuery>,
) -> (StatusCode, Json<serde_json::Value>) {
    let limit = q.limit.clamp(1, 1_000);
    let db    = state.db.clone();
    let cat   = q.category.clone();
    match tokio::task::spawn_blocking(move || db::get_audit(&db, limit, cat.as_deref())).await {
        Ok(Ok(list)) => (StatusCode::OK, Json(serde_json::json!({
            "ok":      true,
            "count":   list.len(),
            "entries": list,
            "ts":      Utc::now(),
        }))),
        Ok(Err(e)) => (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({ "ok": false, "error": e.to_string() }))),
        Err(e)     => (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({ "ok": false, "error": e.to_string() }))),
    }
}
