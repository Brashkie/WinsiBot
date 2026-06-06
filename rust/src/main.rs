mod atomic;
mod auth;
mod config;
mod conversations;
mod db;
mod lock_manager;
mod nlp;
mod routes;
mod session_id;
mod snapshot;

use axum::{middleware, routing::delete, routing::get, routing::post, Router};
use routes::AppState;
use std::path::Path;
use tower_http::trace::TraceLayer;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

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
        "winsibot-session-api v4.0.0 iniciando"
    );

    // Crear directorio para la DB si no existe
    if let Some(parent) = Path::new(&cfg.db_path).parent() {
        if !parent.exists() {
            std::fs::create_dir_all(parent).expect("no se pudo crear directorio de DB");
        }
    }

    let database = db::open(&cfg.db_path).expect("no se pudo abrir SQLite");

    conversations::init(&cfg.conv_db_path);

    let state = AppState {
        sessions_dir:  cfg.sessions_dir.clone(),
        auth_dir:      cfg.auth_dir.clone(),
        locks:         lock_manager::LockManager::new(),
        db:            database,
        conv_db_path:  cfg.conv_db_path.clone(),
    };

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
        // ─── NLP fast-path ───────────────────────────────────────────────────
        .route("/nlp/fast",               post(nlp::nlp_fast))
        // ─── AI conversations (DuckDB) ────────────────────────────────────────
        .route("/ai/learn",               post(conversations::ai_learn))
        .route("/ai/context/:sender",     get(conversations::ai_context))
        .route("/ai/export",              post(conversations::ai_export))
        // ─── Message delivery tracking ────────────────────────────────────────
        .route("/messages/track",         post(routes::messages_track))
        .route("/messages/ack",           post(routes::messages_ack))
        .route("/messages/pending",       get(routes::messages_pending))
        .route("/messages/stats",         get(routes::messages_stats))
        .route("/messages/cleanup",       delete(routes::messages_cleanup))
        .layer(middleware::from_fn_with_state(
            cfg.api_key.clone(),
            auth::require_api_key,
        ));

    let app = Router::new()
        .merge(public)
        .merge(protected)
        .with_state(state)
        .layer(TraceLayer::new_for_http());

    let addr = format!("0.0.0.0:{}", cfg.port);
    tracing::info!("escuchando en http://{}", addr);

    let listener = tokio::net::TcpListener::bind(&addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
