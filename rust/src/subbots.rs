/// subbots.rs — SubBot Manager
///
/// Tracks metadata/state/quotas for up to N sub-bots (default 100).
/// Baileys sockets live in TypeScript; Rust owns the state machine.
///
/// Endpoints (all protected by API key):
///   POST   /subbots/register          — register + quota check
///   GET    /subbots/:id               — info de un subbot
///   DELETE /subbots/:id               — unregister
///   PUT    /subbots/:id/state         — update state (Connected, Disconnected…)
///   POST   /subbots/:id/heartbeat     — touch last_activity
///   POST   /subbots/:id/messages      — increment message counter
///   POST   /subbots/:id/errors        — increment error counter
///   GET    /subbots                   — list all
///   GET    /subbots/stats             — global stats
///   GET    /subbots/can-create        — quota check (query: ?owner=JID)
///   GET    /subbots/config            — config actual (límites, cooldown…)
///   PATCH  /subbots/config            — hot-reload parcial de la config
///   POST   /subbots/cleanup           — remove dead/inactive entries
///
/// register() serializa sus checks de cuota + inserción con `register_lock`
/// para evitar que dos registros concurrentes del mismo owner pasen ambos
/// la validación de cuota antes de que cualquiera inserte (TOCTOU).

use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::Json,
};
use dashmap::DashMap;
use serde::{Deserialize, Serialize};
use std::sync::{
    atomic::{AtomicU64, Ordering},
    Arc, Mutex, RwLock,
};
use std::time::{SystemTime, UNIX_EPOCH};

use crate::routes::AppState;

/// Segundos desde unix epoch — única fuente de verdad para todos los timestamps del manager.
fn unix_now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

// ─── Config ───────────────────────────────────────────────────────────────────

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SubBotConfig {
    pub max_subbots:                usize,
    pub max_per_user:               usize,
    pub cooldown_seconds:           u64,
    pub max_reconnect_attempts:     i32,
    pub connection_timeout_seconds: u64,
}

impl Default for SubBotConfig {
    fn default() -> Self {
        Self {
            max_subbots:                100,
            max_per_user:               5,
            cooldown_seconds:           60,
            max_reconnect_attempts:     20,
            connection_timeout_seconds: 120,
        }
    }
}

// ─── State machine ────────────────────────────────────────────────────────────

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub enum SubBotState {
    Pending,
    Connecting,
    Connected,
    Disconnected,
    Reconnecting,
    Failed,
    LoggedOut,
}

impl SubBotState {
    fn from_str(s: &str) -> Option<Self> {
        match s {
            "Pending"      => Some(Self::Pending),
            "Connecting"   => Some(Self::Connecting),
            "Connected"    => Some(Self::Connected),
            "Disconnected" => Some(Self::Disconnected),
            "Reconnecting" => Some(Self::Reconnecting),
            "Failed"       => Some(Self::Failed),
            "LoggedOut"    => Some(Self::LoggedOut),
            _ => None,
        }
    }

    fn is_active(&self) -> bool {
        matches!(
            self,
            Self::Pending | Self::Connecting | Self::Connected | Self::Reconnecting
        )
    }
}

// ─── Entry ────────────────────────────────────────────────────────────────────

#[derive(Clone, Debug)]
pub struct SubBotEntry {
    pub session_id:         String,
    pub parent_session_id:  String,
    pub owner_jid:          String,
    pub state:              SubBotState,
    pub created_at:         u64,
    pub connected_at:       Option<u64>,
    pub last_activity:      u64,
    pub reconnect_attempts: i32,
    pub messages_handled:   u64,
    pub errors_count:       u64,
    pub session_path:       String,
    pub metadata_json:      Option<String>,
}

// ─── Manager (shared state) ───────────────────────────────────────────────────

pub struct SubBotManager {
    subbots:        DashMap<String, SubBotEntry>,
    cooldowns:      DashMap<String, u64>,
    config:         RwLock<SubBotConfig>,
    total_messages: AtomicU64,
    total_errors:   AtomicU64,
    // Serializa el check-de-cuota + inserción de register() — sin esto, dos
    // registros concurrentes del mismo owner podrían pasar ambos la validación
    // de max_per_user antes de que cualquiera inserte (TOCTOU).
    register_lock:  Mutex<()>,
}

impl SubBotManager {
    pub fn new() -> Arc<Self> {
        let cfg = SubBotConfig::default();
        let cpus = std::thread::available_parallelism()
            .map(|n| n.get())
            .unwrap_or(4)
            .max(16)
            .next_power_of_two();

        Arc::new(Self {
            subbots:        DashMap::with_capacity_and_shard_amount(cfg.max_subbots, cpus),
            cooldowns:      DashMap::new(),
            config:         RwLock::new(cfg),
            total_messages: AtomicU64::new(0),
            total_errors:   AtomicU64::new(0),
            register_lock:  Mutex::new(()),
        })
    }

    fn count_active_by_owner(&self, owner: &str) -> usize {
        self.subbots
            .iter()
            .filter(|e| e.owner_jid == owner && e.state.is_active())
            .count()
    }

    pub fn register(&self, input: RegisterInput) -> RegisterResult {
        if input.session_id.is_empty() || input.owner_jid.is_empty() {
            return RegisterResult::err("sessionId y ownerJid son requeridos");
        }
        if !is_valid_id(&input.session_id) {
            return RegisterResult::err(format!("sessionId inválido: {}", input.session_id));
        }

        // Serializa check-de-cuota + inserción — ver comentario en el campo register_lock.
        let _guard = self.register_lock.lock().unwrap_or_else(|e| e.into_inner());

        let cfg = self.config.read().unwrap_or_else(|e| e.into_inner()).clone();

        if self.subbots.len() >= cfg.max_subbots {
            return RegisterResult::err(format!(
                "Límite global de subbots alcanzado ({}/{})",
                self.subbots.len(), cfg.max_subbots
            ));
        }

        let user_count = self.count_active_by_owner(&input.owner_jid);
        if user_count >= cfg.max_per_user {
            return RegisterResult::err(format!(
                "Límite por usuario alcanzado ({}/{})",
                user_count, cfg.max_per_user
            ));
        }

        if let Some(last) = self.cooldowns.get(&input.owner_jid) {
            let elapsed = unix_now().saturating_sub(*last);
            if elapsed < cfg.cooldown_seconds {
                return RegisterResult::err(format!(
                    "Cooldown activo, espera {} segundos",
                    cfg.cooldown_seconds - elapsed
                ));
            }
        }

        if self.subbots.contains_key(&input.session_id) {
            return RegisterResult {
                ok:         false,
                message:    format!("SubBot {} ya existe", input.session_id),
                session_id: Some(input.session_id),
            };
        }

        let now = unix_now();
        self.subbots.insert(input.session_id.clone(), SubBotEntry {
            session_id:         input.session_id.clone(),
            parent_session_id:  input.parent_session_id,
            owner_jid:          input.owner_jid.clone(),
            state:              SubBotState::Pending,
            created_at:         now,
            connected_at:       None,
            last_activity:      now,
            reconnect_attempts: 0,
            messages_handled:   0,
            errors_count:       0,
            session_path:       input.session_path,
            metadata_json:      input.metadata_json,
        });
        self.cooldowns.insert(input.owner_jid, now);

        tracing::info!(session_id = %input.session_id, total = self.subbots.len(), "subbot registrado");

        RegisterResult {
            ok:         true,
            message:    format!("SubBot {} registrado", input.session_id),
            session_id: Some(input.session_id),
        }
    }

    pub fn unregister(&self, session_id: &str) -> bool {
        if let Some((_, entry)) = self.subbots.remove(session_id) {
            if self.count_active_by_owner(&entry.owner_jid) == 0 {
                self.cooldowns.remove(&entry.owner_jid);
            }
            tracing::info!(session_id, total = self.subbots.len(), "subbot eliminado");
            true
        } else {
            false
        }
    }

    pub fn update_state(&self, session_id: &str, state: SubBotState) -> bool {
        if let Some(mut e) = self.subbots.get_mut(session_id) {
            if matches!(state, SubBotState::Connected) && e.connected_at.is_none() {
                e.connected_at = Some(unix_now());
                e.reconnect_attempts = 0;
            }
            if matches!(state, SubBotState::Reconnecting) {
                e.reconnect_attempts += 1;
            }
            e.state = state;
            e.last_activity = unix_now();
            true
        } else {
            false
        }
    }

    pub fn heartbeat(&self, session_id: &str) -> bool {
        self.subbots.get_mut(session_id).map(|mut e| { e.last_activity = unix_now(); true }).unwrap_or(false)
    }

    pub fn inc_messages(&self, session_id: &str) -> bool {
        if let Some(mut e) = self.subbots.get_mut(session_id) {
            e.messages_handled += 1;
            e.last_activity = unix_now();
            self.total_messages.fetch_add(1, Ordering::Relaxed);
            true
        } else { false }
    }

    pub fn inc_errors(&self, session_id: &str) -> bool {
        if let Some(mut e) = self.subbots.get_mut(session_id) {
            e.errors_count += 1;
            self.total_errors.fetch_add(1, Ordering::Relaxed);
            true
        } else { false }
    }

    pub fn get_info(&self, session_id: &str) -> Option<SubBotInfo> {
        self.subbots.get(session_id).map(|e| to_info(&e))
    }

    pub fn list_all(&self) -> Vec<SubBotInfo> {
        self.subbots.iter().map(|e| to_info(&e)).collect()
    }

    pub fn can_create(&self, owner_jid: &str) -> CanCreateResult {
        let cfg = self.config.read().unwrap_or_else(|e| e.into_inner()).clone();
        let user_count  = self.count_active_by_owner(owner_jid);
        let total_count = self.subbots.len();

        let cooldown_remaining = self.cooldowns.get(owner_jid).map(|last| {
            let elapsed = unix_now().saturating_sub(*last);
            if elapsed < cfg.cooldown_seconds { cfg.cooldown_seconds - elapsed } else { 0 }
        }).unwrap_or(0);

        let can_create = user_count < cfg.max_per_user
            && total_count < cfg.max_subbots
            && cooldown_remaining == 0;

        CanCreateResult {
            can_create,
            reason: if !can_create {
                Some(if user_count >= cfg.max_per_user {
                    format!("Límite por usuario ({}/{})", user_count, cfg.max_per_user)
                } else if total_count >= cfg.max_subbots {
                    format!("Límite global ({}/{})", total_count, cfg.max_subbots)
                } else {
                    format!("Cooldown: {}s restantes", cooldown_remaining)
                })
            } else { None },
            user_count:                user_count as i64,
            user_max:                  cfg.max_per_user as i64,
            total_count:               total_count as i64,
            total_max:                 cfg.max_subbots as i64,
            cooldown_remaining_seconds: cooldown_remaining as i64,
        }
    }

    pub fn stats(&self) -> StatsResult {
        let cfg = self.config.read().unwrap_or_else(|e| e.into_inner()).clone();
        let now = unix_now();
        let (mut connected, mut connecting, mut disconnected, mut failed) = (0i64, 0i64, 0i64, 0i64);
        let (mut total_uptime, mut connected_count) = (0u64, 0u64);

        for e in self.subbots.iter() {
            match e.state {
                SubBotState::Connected => {
                    connected += 1;
                    if let Some(t) = e.connected_at {
                        total_uptime += now.saturating_sub(t);
                        connected_count += 1;
                    }
                }
                SubBotState::Connecting | SubBotState::Pending   => connecting += 1,
                SubBotState::Disconnected | SubBotState::Reconnecting => disconnected += 1,
                SubBotState::Failed | SubBotState::LoggedOut     => failed += 1,
            }
        }

        StatsResult {
            ok:                     true,
            total:                  self.subbots.len() as i64,
            connected,
            connecting,
            disconnected,
            failed,
            max_subbots:            cfg.max_subbots as i64,
            max_per_user:           cfg.max_per_user as i64,
            total_messages_handled: self.total_messages.load(Ordering::Relaxed) as i64,
            total_errors:           self.total_errors.load(Ordering::Relaxed) as i64,
            avg_uptime_seconds:     if connected_count > 0 {
                total_uptime as f64 / connected_count as f64
            } else { 0.0 },
        }
    }

    pub fn get_config(&self) -> SubBotConfig {
        self.config.read().unwrap_or_else(|e| e.into_inner()).clone()
    }

    /// Aplica un parche parcial a la config en caliente — sin reiniciar el proceso.
    /// max_subbots/max_per_user se fuerzan a >= 1 para no bloquear todo el sistema
    /// por accidente con un valor de 0.
    pub fn update_config(&self, patch: ConfigPatch) -> SubBotConfig {
        let mut cfg = self.config.write().unwrap_or_else(|e| e.into_inner());
        if let Some(v) = patch.max_subbots              { cfg.max_subbots = v.max(1); }
        if let Some(v) = patch.max_per_user              { cfg.max_per_user = v.max(1); }
        if let Some(v) = patch.cooldown_seconds          { cfg.cooldown_seconds = v; }
        if let Some(v) = patch.max_reconnect_attempts    { cfg.max_reconnect_attempts = v; }
        if let Some(v) = patch.connection_timeout_seconds { cfg.connection_timeout_seconds = v; }
        cfg.clone()
    }

    pub fn cleanup_dead(&self, max_inactive_seconds: u64) -> i64 {
        let now = unix_now();
        let to_remove: Vec<String> = self.subbots.iter()
            .filter(|e|
                matches!(e.state, SubBotState::Failed | SubBotState::LoggedOut)
                || now.saturating_sub(e.last_activity) > max_inactive_seconds
            )
            .map(|e| e.session_id.clone())
            .collect();

        let removed = to_remove.len() as i64;
        for id in to_remove { self.subbots.remove(&id); }

        if removed > 0 { tracing::info!(removed, "subbots inactivos eliminados"); }
        removed
    }
}

fn to_info(e: &SubBotEntry) -> SubBotInfo {
    let now = unix_now();
    SubBotInfo {
        ok:                 true,
        session_id:         e.session_id.clone(),
        parent_session_id:  e.parent_session_id.clone(),
        owner_jid:          e.owner_jid.clone(),
        state:              format!("{:?}", e.state),
        created_at:         e.created_at as i64,
        connected_at:       e.connected_at.map(|t| t as i64),
        last_activity:      e.last_activity as i64,
        reconnect_attempts: e.reconnect_attempts,
        messages_handled:   e.messages_handled as i64,
        errors_count:       e.errors_count as i64,
        uptime_seconds:     e.connected_at.map(|t| now.saturating_sub(t) as i64).unwrap_or(0),
        session_path:       e.session_path.clone(),
        metadata_json:      e.metadata_json.clone(),
    }
}

fn is_valid_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 128
        && id.chars().all(|c| c.is_alphanumeric() || matches!(c, '-' | '_' | '+'))
}

// ─── Serde types ──────────────────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct RegisterInput {
    #[serde(rename = "sessionId")]
    pub session_id:        String,
    #[serde(rename = "parentSessionId", default = "default_main")]
    pub parent_session_id: String,
    #[serde(rename = "ownerJid")]
    pub owner_jid:         String,
    #[serde(rename = "sessionPath", default)]
    pub session_path:      String,
    #[serde(rename = "metadataJson", default)]
    pub metadata_json:     Option<String>,
}

fn default_main() -> String { "main".to_string() }

#[derive(Deserialize)]
pub struct UpdateStateInput {
    pub state: String,
}

#[derive(Deserialize)]
pub struct CleanupInput {
    #[serde(rename = "maxInactiveSeconds", default = "default_inactive")]
    pub max_inactive_seconds: u64,
}

fn default_inactive() -> u64 { 300 }

#[derive(Deserialize)]
pub struct OwnerQuery {
    pub owner: String,
}

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ConfigPatch {
    pub max_subbots:                Option<usize>,
    pub max_per_user:                Option<usize>,
    pub cooldown_seconds:            Option<u64>,
    pub max_reconnect_attempts:      Option<i32>,
    pub connection_timeout_seconds:  Option<u64>,
}

#[derive(Serialize)]
pub struct RegisterResult {
    pub ok:         bool,
    pub message:    String,
    pub session_id: Option<String>,
}

impl RegisterResult {
    fn err(msg: impl Into<String>) -> Self {
        Self { ok: false, message: msg.into(), session_id: None }
    }
}

#[derive(Serialize)]
pub struct SubBotInfo {
    pub ok:                 bool,
    pub session_id:         String,
    pub parent_session_id:  String,
    pub owner_jid:          String,
    pub state:              String,
    pub created_at:         i64,
    pub connected_at:       Option<i64>,
    pub last_activity:      i64,
    pub reconnect_attempts: i32,
    pub messages_handled:   i64,
    pub errors_count:       i64,
    pub uptime_seconds:     i64,
    pub session_path:       String,
    pub metadata_json:      Option<String>,
}

#[derive(Serialize)]
pub struct CanCreateResult {
    pub can_create:                bool,
    pub reason:                    Option<String>,
    pub user_count:                i64,
    pub user_max:                  i64,
    pub total_count:               i64,
    pub total_max:                 i64,
    pub cooldown_remaining_seconds: i64,
}

#[derive(Serialize)]
pub struct StatsResult {
    pub ok:                     bool,
    pub total:                  i64,
    pub connected:              i64,
    pub connecting:             i64,
    pub disconnected:           i64,
    pub failed:                 i64,
    pub max_subbots:            i64,
    pub max_per_user:           i64,
    pub total_messages_handled: i64,
    pub total_errors:           i64,
    pub avg_uptime_seconds:     f64,
}

// ─── Axum handlers ────────────────────────────────────────────────────────────

fn audit(db: &crate::db::Db, category: &'static str, event: &'static str, detail: String) {
    let db = db.clone();
    tokio::task::spawn_blocking(move || {
        let _ = crate::db::audit_log(&db, category, event, Some(&detail));
    });
}

/// Respuesta uniforme para operaciones touch-by-id (heartbeat/contadores):
/// 200 + {"ok":true} si el subbot existe, 404 + {"ok":false} si no.
fn ok_or_not_found(found: bool) -> (StatusCode, Json<serde_json::Value>) {
    let status = if found { StatusCode::OK } else { StatusCode::NOT_FOUND };
    (status, Json(serde_json::json!({ "ok": found })))
}

pub async fn register(
    State(st): State<AppState>,
    Json(body): Json<RegisterInput>,
) -> (StatusCode, Json<RegisterResult>) {
    let detail = serde_json::json!({
        "sessionId": body.session_id.clone(),
        "owner":     body.owner_jid.clone(),
    })
    .to_string();

    let result = st.subbots.register(body);
    if result.ok {
        audit(&st.db, "subbot", "register", detail);
    }
    let status = if result.ok { StatusCode::OK } else { StatusCode::BAD_REQUEST };
    (status, Json(result))
}

pub async fn unregister(
    State(st): State<AppState>,
    Path(session_id): Path<String>,
) -> (StatusCode, Json<serde_json::Value>) {
    let removed = st.subbots.unregister(&session_id);
    if removed {
        audit(&st.db, "subbot", "unregister", serde_json::json!({ "sessionId": session_id }).to_string());
        (StatusCode::OK, Json(serde_json::json!({ "ok": true, "sessionId": session_id })))
    } else {
        (StatusCode::NOT_FOUND, Json(serde_json::json!({ "ok": false, "error": "not found" })))
    }
}

pub async fn update_state(
    State(st): State<AppState>,
    Path(session_id): Path<String>,
    Json(body): Json<UpdateStateInput>,
) -> (StatusCode, Json<serde_json::Value>) {
    let new_state = match SubBotState::from_str(&body.state) {
        Some(s) => s,
        None => return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "ok": false, "error": format!("estado inválido: {}", body.state) })),
        ),
    };
    let updated = st.subbots.update_state(&session_id, new_state);
    if updated {
        let detail = serde_json::json!({ "sessionId": session_id.clone(), "state": body.state }).to_string();
        audit(&st.db, "subbot", "state_change", detail);
    }
    let status = if updated { StatusCode::OK } else { StatusCode::NOT_FOUND };
    (status, Json(serde_json::json!({ "ok": updated, "sessionId": session_id })))
}

// ─── GET /subbots/config — PATCH /subbots/config (hot-reload) ────────────────

pub async fn get_config(State(st): State<AppState>) -> Json<SubBotConfig> {
    Json(st.subbots.get_config())
}

pub async fn patch_config(
    State(st): State<AppState>,
    Json(patch): Json<ConfigPatch>,
) -> Json<SubBotConfig> {
    let cfg = st.subbots.update_config(patch);
    audit(&st.db, "subbot", "config_update", serde_json::to_string(&cfg).unwrap_or_default());
    tracing::info!(?cfg, "subbots: configuración actualizada en caliente");
    Json(cfg)
}

pub async fn heartbeat(
    State(st): State<AppState>,
    Path(session_id): Path<String>,
) -> (StatusCode, Json<serde_json::Value>) {
    ok_or_not_found(st.subbots.heartbeat(&session_id))
}

pub async fn inc_messages(
    State(st): State<AppState>,
    Path(session_id): Path<String>,
) -> (StatusCode, Json<serde_json::Value>) {
    ok_or_not_found(st.subbots.inc_messages(&session_id))
}

pub async fn inc_errors(
    State(st): State<AppState>,
    Path(session_id): Path<String>,
) -> (StatusCode, Json<serde_json::Value>) {
    ok_or_not_found(st.subbots.inc_errors(&session_id))
}

pub async fn list_all(
    State(st): State<AppState>,
) -> Json<serde_json::Value> {
    let bots = st.subbots.list_all();
    Json(serde_json::json!({ "ok": true, "subbots": bots, "total": bots.len() }))
}

pub async fn get_one(
    State(st): State<AppState>,
    Path(session_id): Path<String>,
) -> (StatusCode, Json<serde_json::Value>) {
    match st.subbots.get_info(&session_id) {
        Some(info) => (
            StatusCode::OK,
            Json(serde_json::to_value(info).unwrap_or_else(|_| serde_json::json!({ "ok": false }))),
        ),
        None => (
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({ "ok": false, "error": "subbot no encontrado" })),
        ),
    }
}

pub async fn stats(
    State(st): State<AppState>,
) -> Json<StatsResult> {
    Json(st.subbots.stats())
}

pub async fn can_create(
    State(st): State<AppState>,
    Query(q): Query<OwnerQuery>,
) -> Json<CanCreateResult> {
    Json(st.subbots.can_create(&q.owner))
}

pub async fn cleanup(
    State(st): State<AppState>,
    Json(body): Json<CleanupInput>,
) -> Json<serde_json::Value> {
    let removed = st.subbots.cleanup_dead(body.max_inactive_seconds);
    Json(serde_json::json!({ "ok": true, "removed": removed }))
}
