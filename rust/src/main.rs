mod alerts;
mod analytics;
mod atomic;
mod auth;
mod bad_mac;
mod config;
mod conversations;
mod db;
mod lock_manager;
mod metrics;
mod nlp;
mod rate_limiter;
mod routes;
mod session_id;
mod snapshot;
mod subbots;
mod tasks;
mod watchdog;

use axum::{
    extract::{Request, State},
    middleware,
    middleware::Next,
    response::Response,
    routing::{delete, get, post, put},
    Router,
};
use routes::AppState;
use std::path::Path;
use tower_http::{compression::CompressionLayer, trace::TraceLayer};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

// ── Middleware: contar respuestas no-2xx en métricas ──────────────────────────
async fn count_errors(State(state): State<AppState>, req: Request, next: Next) -> Response {
    let res = next.run(req).await;
    if !res.status().is_success() {
        state.metrics.inc_error();
    }
    res
}

// ── Apagado ordenado: Ctrl+C/SIGTERM → snapshot final de todas las sesiones ──
async fn shutdown_signal(state: AppState) {
    let ctrl_c = async {
        tokio::signal::ctrl_c()
            .await
            .expect("falló instalar handler de Ctrl+C");
    };

    #[cfg(unix)]
    let terminate = async {
        use tokio::signal::unix::{signal, SignalKind};
        signal(SignalKind::terminate())
            .expect("falló instalar handler de SIGTERM")
            .recv()
            .await;
    };

    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => {},
        _ = terminate => {},
    }

    tracing::warn!("señal de apagado recibida — tomando snapshot final de todas las sesiones");

    let sessions = session_id::list_sessions(&state.sessions_dir);
    let total    = sessions.len();
    let mut ok   = 0u32;

    for sid in &sessions {
        if let Ok(path) = session_id::resolve(&state.sessions_dir, sid) {
            if snapshot::create(&path).is_ok() {
                ok += 1;
            }
        }
    }

    tracing::warn!(ok, total, "snapshot final completado — cerrando proceso");
}

#[tokio::main]
async fn main() {
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "winsibot_session_api=info,tower_http=info".into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    let cfg = config::Config::load();

    tracing::info!(
        port         = cfg.port,
        sessions_dir = %cfg.sessions_dir,
        db_path      = %cfg.db_path,
        "winsibot-session-api v5.1.0 iniciando"
    );

    // Crear directorio para la DB si no existe
    if let Some(parent) = Path::new(&cfg.db_path).parent() {
        if !parent.exists() {
            std::fs::create_dir_all(parent).expect("no se pudo crear directorio de DB");
        }
    }

    let database = db::open(&cfg.db_path).expect("no se pudo abrir SQLite");

    // Conexión DuckDB única, compartida entre conversations.rs y bad_mac.rs
    // (mismo archivo) — ver comentario al inicio de conversations.rs.
    let conv_db = conversations::init(&cfg.conv_db_path)
        .expect("no se pudo abrir DuckDB de conversaciones");
    bad_mac::init_schema(&conv_db);

    let state = AppState {
        sessions_dir:  cfg.sessions_dir.clone(),
        auth_dir:      cfg.auth_dir.clone(),
        locks:         lock_manager::LockManager::new(),
        db:            database,
        conv_db_path:  cfg.conv_db_path.clone(),
        conv_db:       conv_db.clone(),
        bad_mac:       bad_mac::BadMacTracker::new(),
        rate_limiter:  rate_limiter::RateLimiter::new(),
        watchdog:      watchdog::WatchdogState::new(),
        subbots:       subbots::SubBotManager::new(),
        metrics:       metrics::Metrics::new(),
        alert_webhook_url: cfg.alert_webhook_url.clone(),
    };

    // Hidratar reincidencia de Bad MAC desde el historial persistido (últimas
    // 24h) — así un reinicio de Rust no resetea la escalada de cooldown de
    // un grupo que ya venía siendo problemático.
    for (jid, lifetime_clears) in bad_mac::recent_clear_counts(&conv_db, 24) {
        state.bad_mac.seed(&jid, lifetime_clears);
    }

    // Tareas de fondo: auto-snapshot, limpieza de mensajes/subbots, watchdog
    tasks::start(state.clone());

    // Rutas públicas (sin API key)
    let public = Router::new()
        .route("/health",       get(routes::health))
        .route("/health/live",  get(routes::liveness))
        .route("/health/ready", get(routes::readiness));

    // Rutas protegidas por API key
    let protected = Router::new()
        // ─── Sesión ───────────────────────────────────────────────────────────
        .route("/write",                  post(routes::write))
        .route("/read",                   get(routes::read))
        .route("/snapshot",               post(routes::snapshot_route))
        .route("/recover",                post(routes::recover))
        .route("/snapshots",              get(routes::list_snapshots))
        .route("/healthy",                get(routes::is_healthy))
        .route("/sessions",               get(routes::list_sessions))
        .route("/sessions/signal/clear",  post(routes::clear_signal_sessions))
        .route("/sessions/backup",        get(routes::read_backup))
        // ─── NLP fast-path ───────────────────────────────────────────────────
        .route("/nlp/fast",               post(nlp::nlp_fast))
        // ─── AI conversations (DuckDB) ────────────────────────────────────────
        .route("/ai/learn",               post(conversations::ai_learn))
        .route("/ai/context/:sender",     get(conversations::ai_context))
        .route("/ai/export",              post(conversations::ai_export))
        // ─── Bad MAC per-group tracker ────────────────────────────────────────
        .route("/badmac/report",          post(bad_mac::report_bad_mac))
        .route("/badmac/reset",           post(bad_mac::reset_bad_mac))
        .route("/badmac/stats",           get(bad_mac::bad_mac_stats))
        .route("/badmac/export",          post(bad_mac::export_bad_mac))
        // ─── Rate limiter per-sender ──────────────────────────────────────────
        .route("/rate/check",             post(rate_limiter::rate_check))
        .route("/rate/stats",             get(rate_limiter::rate_stats))
        // ─── Watchdog — heartbeat desde Node.js ────────────────────────────────
        .route("/watchdog/ping",          post(watchdog::ping))
        .route("/watchdog/status",        get(watchdog::status))
        // ─── Métricas internas y dashboard agregado ───────────────────────────
        .route("/metrics",                get(metrics::get_metrics))
        .route("/analytics",              get(analytics::analytics))
        .route("/audit",                  get(routes::get_audit))
        // ─── Message delivery tracking ────────────────────────────────────────
        .route("/messages/track",         post(routes::messages_track))
        .route("/messages/ack",           post(routes::messages_ack))
        .route("/messages/pending",       get(routes::messages_pending))
        .route("/messages/stats",         get(routes::messages_stats))
        .route("/messages/cleanup",       delete(routes::messages_cleanup))
        // ─── Sub-bots (100 cap, DashMap, quota, cooldown) ─────────────────────
        .route("/subbots/register",       post(subbots::register))
        .route("/subbots/stats",          get(subbots::stats))
        .route("/subbots/can-create",     get(subbots::can_create))
        .route("/subbots/cleanup",        post(subbots::cleanup))
        .route("/subbots",                get(subbots::list_all))
        .route("/subbots/config",         get(subbots::get_config).patch(subbots::patch_config))
        .route("/subbots/:id",            get(subbots::get_one).delete(subbots::unregister))
        .route("/subbots/:id/state",      put(subbots::update_state))
        .route("/subbots/:id/heartbeat",  post(subbots::heartbeat))
        .route("/subbots/:id/messages",   post(subbots::inc_messages))
        .route("/subbots/:id/errors",     post(subbots::inc_errors))
        .layer(middleware::from_fn_with_state(
            cfg.api_key.clone(),
            auth::require_api_key,
        ));

    let shutdown_state = state.clone();

    let app = Router::new()
        .merge(public)
        .merge(protected)
        .layer(middleware::from_fn_with_state(state.clone(), count_errors))
        .with_state(state)
        .layer(TraceLayer::new_for_http())
        .layer(CompressionLayer::new());

    // Solo loopback — el API lo consume Node.js en la misma máquina. Enlazar a
    // 0.0.0.0 ata el bind a TODAS las interfaces, incluida la virtual de WSL2
    // (vEthernet), que puede chocar con reservas de puerto internas de WSL/Hyper-V
    // y producir AddrInUse aunque ningún proceso visible tenga el puerto.
    let addr = format!("127.0.0.1:{}", cfg.port);
    tracing::info!("escuchando en http://{}", addr);

    let listener = tokio::net::TcpListener::bind(&addr).await.unwrap();
    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal(shutdown_state))
        .await
        .unwrap();
}
