// Los módulos viven en la lib (src/lib.rs) para que benches y tests puedan
// importarlos; el binario los reutiliza desde ahí.
use winsibot_session_api::{
    ai_chat, analytics, auth, bad_mac, config, conversations, db, imagefx, imagesearch,
    lock_manager, metrics, nlp, personality, platform, rate_limiter, routes, session_id,
    snapshot, subbots, tasks, user_memory, watchdog,
};

use axum::{
    extract::{Request, State},
    middleware,
    middleware::Next,
    response::Response,
    routing::{get, post, put},
    Router,
};
use routes::AppState;
use std::path::Path;
use std::time::Duration;
use tower_http::{compression::CompressionLayer, timeout::TimeoutLayer, trace::TraceLayer};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

// Techo global por request — antes no había NINGÚN timeout del lado del
// servidor; un handler colgado (esperando un lock indefinidamente, una
// consulta lenta) no se cortaba nunca acá, solo del lado del cliente
// (Node.js), que sí tiene sus propios timeouts pero no libera nada de este
// proceso. 30s es generoso a propósito — no debe interferir con operaciones
// legítimas más lentas (exports a Parquet, snapshots con muchas sesiones),
// solo cortar lo que está genuinamente colgado.
const REQUEST_TIMEOUT_SECS: u64 = 30;

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

    let sessions_dir = state.sessions_dir.clone();
    let (ok, total) = tokio::task::spawn_blocking(move || {
        let sessions = session_id::list_sessions(&sessions_dir);
        let total    = sessions.len();
        let mut ok   = 0u32;

        for sid in &sessions {
            if let Ok(path) = session_id::resolve(&sessions_dir, sid) {
                if snapshot::create(&path).is_ok() {
                    ok += 1;
                }
            }
        }
        (ok, total)
    }).await.unwrap_or((0, 0));

    tracing::warn!(ok, total, "snapshot final completado — cerrando proceso");
}

// multi_thread explícito (mismo comportamiento que el default de #[tokio::main]
// sin argumentos — un worker por núcleo lógico) para que quede documentado en
// el código en vez de depender de conocer el default implícito de la macro.
#[tokio::main(flavor = "multi_thread")]
async fn main() {
    // Log a archivo con rotación real — antes stdout se redirigía a mano a un
    // único archivo (rust_startup.log) que crecía sin límite (1.7MB y
    // subiendo tras unas horas). Ahora: un archivo nuevo por minuto, y solo
    // se conservan los últimos 20 (≈ los últimos 20 minutos) — los viejos se
    // borran solos, sin tarea de limpieza aparte. `non_blocking` además saca
    // la escritura a disco del hilo que atiende requests — antes cada línea
    // de log escribía sincrónicamente ahí mismo.
    // Rotación DIARIA, no por minuto. Con MINUTELY y 20 archivos solo quedaban
    // los últimos ~20 minutos: si el bot fallaba de madrugada y se miraba por
    // la mañana, el log ya no existía — justo cuando hace falta. Y no era un
    // problema de espacio: medido, los 20 archivos sumaban 28 líneas y 4 KB,
    // así que lo que se estaba ahorrando no existía.
    //
    // 14 días de historia, un archivo por día (fácil de encontrar: "el log del
    // martes"). Si algún día se dispara por un bucle de errores, solo crece ese
    // archivo y max_log_files sigue acotando el total.
    let file_appender = tracing_appender::rolling::Builder::new()
        .rotation(tracing_appender::rolling::Rotation::DAILY)
        .filename_prefix("winsibot")
        .filename_suffix("log")
        .max_log_files(14)
        .build("./logs")
        .expect("no se pudo inicializar el log rotativo");
    let (non_blocking_file, _log_guard) = tracing_appender::non_blocking(file_appender);

    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "winsibot_session_api=info,tower_http=info".into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .with(
            tracing_subscriber::fmt::layer()
                .with_writer(non_blocking_file)
                .with_ansi(false),
        )
        .init();

    let cfg      = config::Config::load();
    let platform = platform::detect();

    tracing::info!(
        port         = cfg.port,
        sessions_dir = %cfg.sessions_dir,
        db_path      = %cfg.db_path,
        "winsibot-session-api v{} iniciando", env!("CARGO_PKG_VERSION")
    );
    tracing::info!(
        os     = platform.os,
        arch   = platform.arch,
        family = platform.family,
        cores  = platform.cores,
        "plataforma detectada — {}", platform.summary()
    );

    // Crear directorio para la DB si no existe
    if let Some(parent) = Path::new(&cfg.db_path).parent() {
        if !parent.exists() {
            std::fs::create_dir_all(parent).expect("no se pudo crear directorio de DB");
        }
    }

    let database = db::open(&cfg.db_path).expect("no se pudo abrir SQLite");

    // Conexión SQLite única, compartida entre conversations.rs y bad_mac.rs
    // (mismo archivo) — ver comentario al inicio de conversations.rs.
    let conv_db = conversations::init(&cfg.conv_db_path)
        .expect("no se pudo abrir la DB de conversaciones");
    bad_mac::init_schema(&conv_db);
    personality::init_schema(&conv_db);
    user_memory::init_schema(&conv_db);

    let state = AppState {
        sessions_dir:  cfg.sessions_dir.clone(),
        auth_dir:      cfg.auth_dir.clone(),
        locks:         lock_manager::LockManager::new(),
        db:            database,
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
        .route("/healthy",                get(routes::is_healthy))
        .route("/sessions",               get(routes::list_sessions))
        .route("/sessions/signal/clear",  post(routes::clear_signal_sessions))
        .route("/sessions/backup",        get(routes::read_backup))
        // ─── NLP fast-path ───────────────────────────────────────────────────
        .route("/nlp/fast",               post(nlp::nlp_fast))
        // ─── AI conversations (SQLite) ────────────────────────────────────────
        .route("/ai/learn",               post(conversations::ai_learn))
        .route("/ai/context/:sender",     get(conversations::ai_context))
        .route("/ai/observe",             post(conversations::ai_observe))
        .route("/ai/profile/:jid",        get(conversations::ai_profile)
                                            .delete(conversations::ai_delete_profile))
        .route("/ai/group-style/:gjid",   get(conversations::ai_group_style))
        .route("/ai/corpus/stats",        get(conversations::ai_corpus_stats))
        // Portados de Python en la 8.11.0 (ver imagefx.rs e imagesearch.rs).
        .route("/imagefx/lego",           post(imagefx::lego))
        .route("/search/image",           post(imagesearch::search_image))
        .route("/search/images",          post(imagesearch::search_images))
        // Portados de Python en la 8.11.0: personalidad, reputacion y la IA
        // de verdad (ver personality.rs, user_memory.rs y ai_chat.rs).
        .route("/ai/personality/respond", post(personality::respond))
        .route("/ai/personality/mode",    get(personality::mode_get)
                                            .post(personality::mode_set))
        .route("/ai/personality/reset",   post(personality::mode_reset))
        .route("/ai/memory/toxic",        get(user_memory::toxic))
        .route("/ai/memory/:jid",         get(user_memory::get))
        .route("/ai/memory/:jid/update",  post(user_memory::update))
        .route("/ai/chat/respond",        post(ai_chat::respond))
        .route("/ai/chat/imitate",        post(ai_chat::imitate))
        // ─── Bad MAC per-group tracker ────────────────────────────────────────
        .route("/badmac/report",          post(bad_mac::report_bad_mac))
        // ─── Rate limiter per-sender ──────────────────────────────────────────
        .route("/rate/check",             post(rate_limiter::rate_check))
        .route("/spam/check",             post(rate_limiter::spam_check))
        // ─── Watchdog — heartbeat desde Node.js ────────────────────────────────
        .route("/watchdog/ping",          post(watchdog::ping))
        .route("/watchdog/status",        get(watchdog::status))
        // ─── Métricas internas y dashboard agregado ───────────────────────────
        .route("/metrics",                get(metrics::get_metrics))
        .route("/analytics",              get(analytics::analytics))
        // ─── Message delivery tracking ────────────────────────────────────────
        .route("/messages/track",         post(routes::messages_track))
        .route("/messages/ack",           post(routes::messages_ack))
        .route("/messages/pending",       get(routes::messages_pending))
        .route("/outbox/enqueue",         post(routes::outbox_enqueue))
        .route("/outbox/unsent",          get(routes::outbox_unsent))
        .route("/outbox/sent",            post(routes::outbox_sent))
        .route("/outbox/retry",           post(routes::outbox_retry))
        .route("/stats/bump",             post(routes::stats_bump))
        .route("/stats/counters",         get(routes::stats_counters))
        .route("/stats/top-commands",     get(routes::stats_top_commands))
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
        .layer(CompressionLayer::new())
        .layer(TimeoutLayer::new(Duration::from_secs(REQUEST_TIMEOUT_SECS)));

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
