//! personality.rs — modos de personalidad y generación de respuestas locales.
//!
//! Routes: POST /ai/personality/respond, GET y POST /ai/personality/mode,
//!         POST /ai/personality/reset
//!
//! Portado de python/ai/personality.py (1141 líneas) y python/ai/humor_engine.py
//! (441). De esas 1582, **970 eran tablas de datos**: 489 frases de respuesta en
//! 12 modos y 121 de humor. Esas tablas no son código y no tiene sentido
//! traducirlas a Rust a mano — se extrajeron tal cual a `assets/personality.json`
//! y se incrustan en el binario con `include_str!`.
//!
//! Incrustarlas y no leerlas de disco es deliberado: el objetivo de esta tanda
//! es que instalar el bot sea un binario y nada más. Un archivo de datos al lado
//! es un archivo que se puede perder, quedar desactualizado o no copiarse al
//! desplegar. El coste es que cambiar una frase pide recompilar, que para quien
//! toca las personalidades ya es el caso igual.
//!
//! Esto es el camino LOCAL: lo que responde el bot cuando Ollama y las APIs
//! cloud no están disponibles. La generación con IA real vive en `ai_chat.rs`.

use axum::{extract::State, response::Json};
use chrono::{Local, Timelike};
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::sync::OnceLock;

use crate::conversations::ConvDb;
use crate::rng;
use crate::routes::AppState;

// ── Datos ────────────────────────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct HumorData {
    /// Probabilidad de aplicar humor, por modo.
    pub mode_prob:        HashMap<String, f64>,
    /// modo → categoría (prefix, suffix, irony, roast...) → frases.
    pub bank:             HashMap<String, HashMap<String, Vec<String>>>,
    /// Reemplazos para imitar la jerga del interlocutor.
    pub slang_inject:     HashMap<String, Vec<String>>,
    pub friendly_intents: Vec<String>,
    pub avoid_intents:    Vec<String>,
}

#[derive(Deserialize)]
pub struct PersonalityData {
    pub modes:        Vec<String>,
    pub default_mode: String,
    /// modo → intención → frases posibles.
    pub responses:    HashMap<String, HashMap<String, Vec<String>>>,
    pub humor:        HumorData,
}

const JSON: &str = include_str!("../assets/personality.json");

pub fn data() -> &'static PersonalityData {
    static D: OnceLock<PersonalityData> = OnceLock::new();
    D.get_or_init(|| {
        // Si esto falla, el JSON incrustado está mal y no hay nada que
        // degradar: el bot no tendría ninguna respuesta que dar. Mejor que
        // reviente al arrancar, en el primer uso, que servir "..." para
        // siempre sin que nadie entienda por qué.
        serde_json::from_str(JSON).expect("assets/personality.json inválido")
    })
}

fn friendly_intents() -> &'static HashSet<&'static str> {
    static S: OnceLock<HashSet<&'static str>> = OnceLock::new();
    S.get_or_init(|| data().humor.friendly_intents.iter().map(|s| s.as_str()).collect())
}

fn avoid_intents() -> &'static HashSet<&'static str> {
    static S: OnceLock<HashSet<&'static str>> = OnceLock::new();
    S.get_or_init(|| data().humor.avoid_intents.iter().map(|s| s.as_str()).collect())
}

// ── Modos, persistidos ───────────────────────────────────────────────────────
//
// Un modo global más un modo por grupo. Se guardan en la MISMA base que
// `conversations`, en vez del `personality_config` que Python creaba en su
// propio SQLite: una base menos que respaldar, y la conexión ya está abierta.

pub fn init_schema(db: &ConvDb) {
    if let Ok(conn) = db.lock() {
        let r = conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS personality_config (
                key        TEXT PRIMARY KEY,
                value      TEXT NOT NULL,
                updated_at BIGINT NOT NULL DEFAULT 0
            );",
        );
        if let Err(e) = r {
            tracing::warn!("SQLite schema init error (personality): {}", e);
        }
    }
}

fn leer_config(db: &ConvDb, key: &str) -> Option<String> {
    let conn = db.lock().ok()?;
    conn.query_row(
        "SELECT value FROM personality_config WHERE key = ?1",
        rusqlite::params![key],
        |r| r.get::<_, String>(0),
    )
    .ok()
}

fn escribir_config(db: &ConvDb, key: &str, value: &str) -> Result<(), String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO personality_config (key, value, updated_at) VALUES (?1, ?2, ?3)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
        rusqlite::params![key, value, chrono::Utc::now().timestamp_millis()],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn modo_global(db: &ConvDb) -> String {
    leer_config(db, "global_mode").unwrap_or_else(|| data().default_mode.clone())
}

fn modos_por_grupo(db: &ConvDb) -> HashMap<String, String> {
    leer_config(db, "group_modes")
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

/// Modo activo para un chat. Sin `jid`, el global.
pub fn modo(db: &ConvDb, jid: &str) -> String {
    if !jid.is_empty() {
        if let Some(m) = modos_por_grupo(db).get(jid) {
            return m.clone();
        }
    }
    modo_global(db)
}

pub fn set_modo(db: &ConvDb, nuevo: &str, jid: &str) -> Result<bool, String> {
    if !data().modes.iter().any(|m| m == nuevo) {
        return Ok(false);
    }
    if jid.is_empty() {
        escribir_config(db, "global_mode", nuevo)?;
    } else {
        let mut g = modos_por_grupo(db);
        g.insert(jid.to_string(), nuevo.to_string());
        let s = serde_json::to_string(&g).map_err(|e| e.to_string())?;
        escribir_config(db, "group_modes", &s)?;
    }
    Ok(true)
}

/// Devuelve el chat al modo por defecto. Sin `jid`, resetea el global y borra
/// todos los modos por grupo.
pub fn reset_modo(db: &ConvDb, jid: &str) -> Result<(), String> {
    if jid.is_empty() {
        escribir_config(db, "global_mode", &data().default_mode)?;
        escribir_config(db, "group_modes", "{}")?;
    } else {
        let mut g = modos_por_grupo(db);
        g.remove(jid);
        let s = serde_json::to_string(&g).map_err(|e| e.to_string())?;
        escribir_config(db, "group_modes", &s)?;
    }
    Ok(())
}

// ── Contexto del interlocutor ────────────────────────────────────────────────

/// Lo que `user_memory.rs` sabe del usuario y que modula la respuesta.
#[derive(Debug, Default, Clone, Deserialize, Serialize)]
pub struct Contexto {
    #[serde(default)]
    pub reputation:     String,
    #[serde(default)]
    pub response_style: String,
    #[serde(default)]
    pub recent_intents: Vec<String>,
    #[serde(default)]
    pub uses_slang:     bool,
}

/// Estilo de escritura del usuario, calculado por `conversations.rs`.
#[derive(Debug, Default, Clone, Deserialize, Serialize)]
pub struct EstiloUsuario {
    #[serde(default)]
    pub avg_len:      f64,
    #[serde(default)]
    pub emoji_freq:   f64,
    #[serde(default)]
    pub common_words: Vec<String>,
}

#[derive(Debug, Default, Deserialize)]
pub struct TurnoHistorial {
    #[serde(default)]
    pub reply: String,
}

// ── Intensidad ───────────────────────────────────────────────────────────────

/// Cuánto "carácter" se le pone a la respuesta, de 0 a 1.
///
/// Sube con la mala reputación y con las intenciones negativas recientes: a
/// quien viene insultando se le responde más seco.
fn intensidad(ctx: &Contexto) -> f64 {
    let mut base = match ctx.reputation.as_str() {
        "trusted"    => 0.3,
        "suspicious" => 0.7,
        "toxic"      => 0.9,
        _            => 0.5,
    };
    let negativas = ctx
        .recent_intents
        .iter()
        .rev()
        .take(5)
        .filter(|i| matches!(i.as_str(), "insult" | "spam" | "nsfw"))
        .count();
    base += negativas as f64 * 0.08;
    (base.min(1.0) * 100.0).round() / 100.0
}

fn aplicar_intensidad(texto: &str, intensidad: f64, modo: &str) -> String {
    let t = texto.trim();
    if intensidad > 0.8 && modo == "toxico" {
        // `chars().count()`, no `len()`: con acentos y emojis los bytes no son
        // caracteres, y el umbral es sobre lo que se lee.
        let mut s = if t.chars().count() < 30 { t.to_uppercase() } else { t.to_string() };
        if !s.ends_with(['.', '!', '?']) {
            s.push('.');
        }
        s
    } else if intensidad < 0.3 && modo == "amable" {
        let sufijo = rng::pick(&[" 😊", " ¿ok?", ""]).copied().unwrap_or("");
        format!("{t}{sufijo}")
    } else if intensidad > 0.7 && modo == "sarcastico" {
        if ["...", "Wow", "Vaya", "Obvio"].iter().any(|p| t.contains(p)) {
            t.to_string()
        } else {
            format!("Claro... {t}")
        }
    } else {
        t.to_string()
    }
    .trim()
    .to_string()
}

// ── Personalización ──────────────────────────────────────────────────────────

fn re_tardes_noches() -> &'static Regex {
    static R: OnceLock<Regex> = OnceLock::new();
    R.get_or_init(|| Regex::new(r"(?i)buenas?\s*(tardes|noches)?").unwrap())
}

fn re_dias() -> &'static Regex {
    static R: OnceLock<Regex> = OnceLock::new();
    R.get_or_init(|| Regex::new(r"(?i)buenos?\s*(días|dias)?").unwrap())
}

/// Ajusta el saludo a la hora real y refleja la jerga del interlocutor.
fn personalizar(texto: &str, ctx: &Contexto) -> String {
    let hora = Local::now().hour();
    let bajo = texto.to_lowercase();

    let mut t = if bajo.contains("buenas") || bajo.contains("buenos") {
        if (5..12).contains(&hora) {
            re_tardes_noches().replace(texto, "Buenos días").into_owned()
        } else if (12..19).contains(&hora) {
            re_dias().replace(texto, "Buenas tardes").into_owned()
        } else {
            re_dias().replace(texto, "Buenas noches").into_owned()
        }
    } else {
        texto.to_string()
    };

    if ctx.uses_slang {
        for (de, a) in [(" amigo", " bro"), (" usuario", " causa"), (" bien", " chido")] {
            t = t.replace(de, a);
        }
    }
    t
}

// ── Elección de la frase ─────────────────────────────────────────────────────

/// Frases candidatas para un modo e intención, con las caídas de siempre:
/// la intención en ese modo → el fallback del modo → la intención en el modo
/// por defecto → el fallback del modo por defecto.
fn candidatas<'a>(modo: &str, intent: &str) -> &'a [String] {
    static VACIO: &[String] = &[];
    let d = data();
    let por_defecto = &d.default_mode;

    d.responses
        .get(modo)
        .and_then(|m| m.get(intent))
        .or_else(|| d.responses.get(modo).and_then(|m| m.get("fallback")))
        .or_else(|| d.responses.get(por_defecto).and_then(|m| m.get(intent)))
        .or_else(|| d.responses.get(por_defecto).and_then(|m| m.get("fallback")))
        .map(|v| v.as_slice())
        .unwrap_or(VACIO)
}

/// Elige una frase evitando repetir las de los últimos turnos.
///
/// Sin este filtro el bot repetía respuestas en conversaciones seguidas, que es
/// lo que más delata que detrás hay una lista de frases y no una IA.
fn elegir(modo: &str, intent: &str, historial: &[TurnoHistorial]) -> String {
    let pool = candidatas(modo, intent);
    if pool.is_empty() {
        return "...".to_string();
    }
    if historial.is_empty() {
        return rng::pick(pool).cloned().unwrap_or_else(|| "...".into());
    }

    let recientes: HashSet<String> = historial
        .iter()
        .rev()
        .take(5)
        .map(|h| h.reply.trim().to_lowercase())
        .collect();

    let frescas: Vec<&String> = pool
        .iter()
        .filter(|r| !recientes.contains(&r.trim().to_lowercase()))
        .collect();

    if frescas.is_empty() {
        // Todas usadas hace poco: mejor repetir una que no decir nada.
        rng::pick(pool).cloned().unwrap_or_else(|| "...".into())
    } else {
        rng::pick(&frescas).map(|s| (*s).clone()).unwrap_or_else(|| "...".into())
    }
}

// ── Humor ────────────────────────────────────────────────────────────────────

fn frase_humor(modo: &str, categoria: &str) -> Option<String> {
    let d = data();
    d.humor
        .bank
        .get(modo)
        .and_then(|m| m.get(categoria))
        .or_else(|| d.humor.bank.get(&d.default_mode).and_then(|m| m.get(categoria)))
        .and_then(|v| rng::pick(v))
        .cloned()
}

/// Adorna la respuesta con humor, si el modo y la intención lo admiten.
///
/// La decisión es probabilística por modo (`mode_prob`): en `formal` casi nunca,
/// en `chistoso` casi siempre. Y hay intenciones donde el humor sobra o es
/// contraproducente — `avoid_intents` cubre insultos, spam y NSFW, donde una
/// broma del bot leería como que le da lo mismo.
fn aplicar_humor(texto: &str, modo: &str, intent: &str) -> String {
    if avoid_intents().contains(intent) {
        return texto.to_string();
    }
    let prob = data().humor.mode_prob.get(modo).copied().unwrap_or(0.0);
    // Las intenciones amistosas lo llevan más seguido; el resto, la mitad.
    let prob = if friendly_intents().contains(intent) { prob } else { prob * 0.5 };
    if rng::unit() >= prob {
        return texto.to_string();
    }

    match rng::below(3) {
        0 => frase_humor(modo, "suffix").map_or_else(|| texto.to_string(), |f| format!("{texto} {f}")),
        1 => frase_humor(modo, "prefix").map_or_else(|| texto.to_string(), |f| format!("{f} {texto}")),
        _ => frase_humor(modo, "irony").map_or_else(|| texto.to_string(), |f| format!("{texto} {f}")),
    }
}

// ── Imitación del estilo ─────────────────────────────────────────────────────

/// Acerca la respuesta a cómo escribe el usuario: largo, emojis y vocabulario.
///
/// Portado de python/ai/imitation.py. Solo se aplica con suficientes mensajes
/// del usuario — el umbral lo decide el caller, que es quien sabe el msg_count.
pub fn imitar(texto: &str, estilo: &EstiloUsuario) -> String {
    let mut t = texto.to_string();

    // Si el usuario escribe muy corto, recortar a la primera oración: una
    // parrafada contestando a un "ok" se nota mucho.
    if estilo.avg_len > 0.0 && estilo.avg_len < 20.0 && t.chars().count() > 60 {
        if let Some(i) = t.find(['.', '!', '?']) {
            let corte: String = t.chars().take(t[..=i].chars().count()).collect();
            if corte.chars().count() > 10 {
                t = corte;
            }
        }
    }

    // Reflejar el uso de emojis en los dos sentidos.
    let tiene_emoji = t.chars().any(|c| (c as u32) > 0x2500);
    if estilo.emoji_freq > 0.5 && !tiene_emoji {
        if let Some(e) = rng::pick(&["😄", "👍", "🙌", "✨"]) {
            t = format!("{t} {e}");
        }
    } else if estilo.emoji_freq < 0.05 && tiene_emoji {
        t = t.chars().filter(|c| (*c as u32) <= 0x2500).collect::<String>();
        t = t.split_whitespace().collect::<Vec<_>>().join(" ");
    }

    t.trim().to_string()
}

// ── Generación ───────────────────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct RespondRequest {
    pub intent:      String,
    #[serde(default)]
    pub text:        String,
    #[serde(default)]
    pub jid:         String,
    #[serde(default)]
    pub use_humor:   bool,
    #[serde(default)]
    pub context:     Contexto,
    #[serde(default)]
    pub history:     Vec<TurnoHistorial>,
    #[serde(default)]
    pub user_style:  Option<EstiloUsuario>,
}

/// El camino local completo: elegir, ajustar intensidad, personalizar, humor e
/// imitación. Es lo que responde el bot sin IA real detrás.
///
/// Devuelve el texto y el modo que de verdad se usó, que puede no ser el
/// configurado: a un usuario con reputación tóxica se le contesta en
/// `sarcastico` aunque el grupo esté en `amable`. Informar el configurado —que
/// es lo que hacía la versión de Python— deja al caller viendo "amable" junto
/// a una respuesta sarcástica, sin forma de explicar por qué.
pub fn generar(
    modo_base: &str,
    req:       &RespondRequest,
) -> (String, String) {
    // El modo puede cambiar según con quién se está hablando.
    let mut modo = modo_base.to_string();
    if req.context.reputation == "toxic" && modo == "amable" {
        modo = "sarcastico".into();
    }
    match req.context.response_style.as_str() {
        "sarcastic" if modo != "toxico" && modo != "sarcastico" => modo = "sarcastico".into(),
        "humor" if modo == "formal" => modo = "alegre".into(),
        _ => {}
    }

    let mut r = elegir(&modo, &req.intent, &req.history);
    r = aplicar_intensidad(&r, intensidad(&req.context), &modo);
    r = personalizar(&r, &req.context);

    if req.use_humor {
        r = aplicar_humor(&r, &modo, &req.intent);
    }
    if let Some(est) = &req.user_style {
        r = imitar(&r, est);
    }
    (r, modo)
}

// ── Handlers ─────────────────────────────────────────────────────────────────

pub async fn respond(
    State(state): State<AppState>,
    Json(req):    Json<RespondRequest>,
) -> Json<serde_json::Value> {
    let configurado = modo(&state.conv_db, &req.jid);
    let (texto, usado) = generar(&configurado, &req);
    Json(serde_json::json!({
        "success": true,
        "data":    texto,
        "mode":    usado,
        "configured_mode": configurado,
    }))
}

#[derive(Deserialize)]
pub struct ModeRequest {
    #[serde(default)]
    pub mode: String,
    #[serde(default)]
    pub jid:  String,
}

pub async fn mode_get(State(state): State<AppState>) -> Json<serde_json::Value> {
    Json(serde_json::json!({
        "success": true,
        "data": {
            "current":     modo_global(&state.conv_db),
            "modes":       data().modes,
            "group_modes": modos_por_grupo(&state.conv_db),
        }
    }))
}

pub async fn mode_set(
    State(state): State<AppState>,
    Json(req):    Json<ModeRequest>,
) -> Json<serde_json::Value> {
    match set_modo(&state.conv_db, &req.mode, &req.jid) {
        Ok(true)  => Json(serde_json::json!({ "success": true, "data": { "mode": req.mode } })),
        Ok(false) => Json(serde_json::json!({
            "success": false,
            "error":   format!("modo desconocido: {}", req.mode),
            "modes":   data().modes,
        })),
        Err(e) => Json(serde_json::json!({ "success": false, "error": e })),
    }
}

pub async fn mode_reset(
    State(state): State<AppState>,
    Json(req):    Json<ModeRequest>,
) -> Json<serde_json::Value> {
    match reset_modo(&state.conv_db, &req.jid) {
        Ok(())  => Json(serde_json::json!({ "success": true, "data": { "mode": data().default_mode } })),
        Err(e)  => Json(serde_json::json!({ "success": false, "error": e })),
    }
}

// ── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;
    use std::sync::{Arc, Mutex};

    fn db() -> ConvDb {
        let conn = Connection::open_in_memory().unwrap();
        let db: ConvDb = Arc::new(Mutex::new(conn));
        init_schema(&db);
        db
    }

    fn ctx(rep: &str) -> Contexto {
        Contexto { reputation: rep.into(), ..Default::default() }
    }

    // ── Los datos incrustados ───────────────────────────────────────────────

    #[test]
    fn el_json_incrustado_carga_y_esta_completo() {
        let d = data();
        assert_eq!(d.modes.len(), 12, "modos: {:?}", d.modes);
        assert!(d.modes.contains(&d.default_mode), "el modo por defecto debe estar en la lista");
        // Cada modo tiene que tener su banco de frases, o caeria al default
        // sin que nadie se entere.
        for m in &d.modes {
            assert!(d.responses.contains_key(m), "el modo {m} no tiene respuestas");
            assert!(d.humor.mode_prob.contains_key(m), "el modo {m} no tiene probabilidad de humor");
        }
    }

    #[test]
    fn todos_los_modos_tienen_fallback() {
        // Sin fallback, una intencion que ese modo no cubra se va al modo por
        // defecto y el bot cambia de personalidad a mitad de conversacion.
        for (modo, intents) in &data().responses {
            assert!(intents.contains_key("fallback"), "el modo {modo} no tiene fallback");
        }
    }

    #[test]
    fn ninguna_frase_esta_vacia() {
        for (modo, intents) in &data().responses {
            for (intent, frases) in intents {
                assert!(!frases.is_empty(), "{modo}/{intent} no tiene ninguna frase");
                for f in frases {
                    assert!(!f.trim().is_empty(), "frase vacia en {modo}/{intent}");
                }
            }
        }
    }

    // ── Modos ───────────────────────────────────────────────────────────────

    #[test]
    fn el_modo_por_defecto_sale_sin_configurar_nada() {
        let db = db();
        assert_eq!(modo(&db, ""), data().default_mode);
        assert_eq!(modo(&db, "g1@g.us"), data().default_mode);
    }

    #[test]
    fn el_modo_de_un_grupo_pisa_al_global() {
        let db = db();
        assert!(set_modo(&db, "formal", "").unwrap());
        assert!(set_modo(&db, "gamer", "g1@g.us").unwrap());

        assert_eq!(modo(&db, "g1@g.us"), "gamer", "el grupo manda");
        assert_eq!(modo(&db, "g2@g.us"), "formal", "otro grupo usa el global");
        assert_eq!(modo(&db, ""), "formal");
    }

    #[test]
    fn un_modo_desconocido_se_rechaza() {
        let db = db();
        assert!(!set_modo(&db, "inventado", "").unwrap());
        assert_eq!(modo(&db, ""), data().default_mode, "no debe haber cambiado nada");
    }

    #[test]
    fn el_reset_de_un_grupo_lo_devuelve_al_global() {
        let db = db();
        set_modo(&db, "formal", "").unwrap();
        set_modo(&db, "toxico", "g1@g.us").unwrap();
        reset_modo(&db, "g1@g.us").unwrap();
        assert_eq!(modo(&db, "g1@g.us"), "formal");
        assert_eq!(modo(&db, ""), "formal", "el global no se toca");
    }

    #[test]
    fn el_reset_global_limpia_tambien_los_grupos() {
        let db = db();
        set_modo(&db, "formal", "").unwrap();
        set_modo(&db, "toxico", "g1@g.us").unwrap();
        reset_modo(&db, "").unwrap();
        assert_eq!(modo(&db, ""), data().default_mode);
        assert_eq!(modo(&db, "g1@g.us"), data().default_mode, "los grupos tambien");
    }

    #[test]
    fn los_modos_sobreviven_a_releer_la_base() {
        // Se guardan en SQLite, no en memoria: dos lecturas seguidas tienen que
        // dar lo mismo sin que haya caches de por medio.
        let db = db();
        set_modo(&db, "kawaii", "g9@g.us").unwrap();
        assert_eq!(modo(&db, "g9@g.us"), "kawaii");
        assert_eq!(modo(&db, "g9@g.us"), "kawaii");
    }

    // ── Intensidad ──────────────────────────────────────────────────────────

    #[test]
    fn la_intensidad_sube_con_la_mala_reputacion() {
        assert!(intensidad(&ctx("trusted")) < intensidad(&ctx("normal")));
        assert!(intensidad(&ctx("normal")) < intensidad(&ctx("suspicious")));
        assert!(intensidad(&ctx("suspicious")) < intensidad(&ctx("toxic")));
    }

    #[test]
    fn la_intensidad_sube_con_las_intenciones_negativas_recientes() {
        let limpio = Contexto { reputation: "normal".into(), ..Default::default() };
        let sucio = Contexto {
            reputation: "normal".into(),
            recent_intents: vec!["insult".into(), "spam".into(), "nsfw".into()],
            ..Default::default()
        };
        assert!(intensidad(&sucio) > intensidad(&limpio));
    }

    #[test]
    fn la_intensidad_solo_mira_las_ultimas_cinco() {
        let viejo = Contexto {
            reputation: "normal".into(),
            // Cinco insultos seguidos de cinco neutros: los insultos ya salieron
            // de la ventana y no deben seguir pesando.
            recent_intents: vec![
                "insult".into(), "insult".into(), "insult".into(), "insult".into(), "insult".into(),
                "neutral".into(), "neutral".into(), "neutral".into(), "neutral".into(), "neutral".into(),
            ],
            ..Default::default()
        };
        assert_eq!(intensidad(&viejo), intensidad(&ctx("normal")));
    }

    #[test]
    fn la_intensidad_nunca_pasa_de_uno() {
        let peor = Contexto {
            reputation: "toxic".into(),
            recent_intents: vec!["insult".into(); 20],
            ..Default::default()
        };
        assert!(intensidad(&peor) <= 1.0, "dio {}", intensidad(&peor));
    }

    // ── Eleccion de frase ───────────────────────────────────────────────────

    #[test]
    fn elegir_devuelve_una_frase_del_banco() {
        let pool = candidatas("amable", "greeting");
        assert!(!pool.is_empty());
        for _ in 0..50 {
            let r = elegir("amable", "greeting", &[]);
            assert!(pool.contains(&r), "frase fuera del banco: {r:?}");
        }
    }

    #[test]
    fn una_intencion_desconocida_cae_al_fallback() {
        let r = elegir("amable", "intencion_que_no_existe", &[]);
        assert_ne!(r, "...", "deberia haber caido al fallback del modo");
        let fallback = candidatas("amable", "fallback");
        assert!(fallback.contains(&r));
    }

    #[test]
    fn un_modo_desconocido_cae_al_modo_por_defecto() {
        let r = elegir("modo_que_no_existe", "greeting", &[]);
        let d = data();
        let esperado = &d.responses[&d.default_mode]["greeting"];
        assert!(esperado.contains(&r), "frase inesperada: {r:?}");
    }

    #[test]
    fn no_repite_las_respuestas_recientes() {
        // Es lo que mas delata que detras hay una lista de frases y no una IA.
        let pool = candidatas("amable", "greeting").to_vec();
        assert!(pool.len() > 1, "este test necesita un banco con varias frases");

        let historial: Vec<TurnoHistorial> = pool
            .iter()
            .take(pool.len() - 1)
            .map(|r| TurnoHistorial { reply: r.clone() })
            .take(5)
            .collect();

        let usadas: Vec<String> = historial.iter().map(|h| h.reply.to_lowercase()).collect();
        for _ in 0..50 {
            let r = elegir("amable", "greeting", &historial);
            assert!(!usadas.contains(&r.to_lowercase()), "repitio {r:?}");
        }
    }

    #[test]
    fn si_todas_fueron_usadas_repite_en_vez_de_callarse() {
        let pool = candidatas("amable", "greeting").to_vec();
        let historial: Vec<TurnoHistorial> =
            pool.iter().map(|r| TurnoHistorial { reply: r.clone() }).collect();
        let r = elegir("amable", "greeting", &historial);
        assert!(pool.contains(&r), "deberia repetir una del banco, no devolver '...'");
    }

    // ── Personalizacion ─────────────────────────────────────────────────────

    #[test]
    fn la_jerga_se_refleja_solo_si_el_usuario_la_usa() {
        let con = Contexto { uses_slang: true, ..Default::default() };
        let sin = Contexto::default();
        assert_eq!(personalizar("hola amigo", &con), "hola bro");
        assert_eq!(personalizar("hola amigo", &sin), "hola amigo");
    }

    #[test]
    fn personalizar_no_toca_el_texto_que_no_saluda() {
        let t = "el partido es a las ocho";
        assert_eq!(personalizar(t, &Contexto::default()), t);
    }

    #[test]
    fn la_intensidad_alta_en_modo_toxico_grita_y_cierra_la_frase() {
        let r = aplicar_intensidad("ya basta", 0.9, "toxico");
        assert_eq!(r, "YA BASTA.");
    }

    #[test]
    fn la_intensidad_alta_no_grita_un_texto_largo() {
        // El umbral es de 30 caracteres: gritar un parrafo entero es ilegible.
        let largo = "esto es una frase bastante mas larga que el umbral de treinta";
        let r = aplicar_intensidad(largo, 0.9, "toxico");
        assert_eq!(r, format!("{largo}."), "no deberia estar en mayusculas");
    }

    #[test]
    fn la_intensidad_alta_en_sarcastico_no_apila_prefijos() {
        assert_eq!(aplicar_intensidad("si claro", 0.9, "sarcastico"), "Claro... si claro");
        // Si ya lo tiene, no se vuelve a poner.
        let ya = aplicar_intensidad("Claro... si", 0.9, "sarcastico");
        assert_eq!(ya.matches("Claro...").count(), 1, "duplico el prefijo: {ya:?}");
    }

    // ── Imitacion ───────────────────────────────────────────────────────────

    #[test]
    fn imitar_agrega_emoji_a_quien_los_usa() {
        let estilo = EstiloUsuario { emoji_freq: 0.9, avg_len: 40.0, ..Default::default() };
        let r = imitar("listo", &estilo);
        assert!(r.chars().any(|c| (c as u32) > 0x2500), "deberia llevar emoji: {r:?}");
    }

    #[test]
    fn imitar_quita_los_emojis_a_quien_no_los_usa() {
        let estilo = EstiloUsuario { emoji_freq: 0.0, avg_len: 40.0, ..Default::default() };
        let r = imitar("listo 😄", &estilo);
        assert!(!r.chars().any(|c| (c as u32) > 0x2500), "no deberia llevar emoji: {r:?}");
        assert_eq!(r, "listo", "y no deberia dejar espacios sueltos");
    }

    #[test]
    fn imitar_acorta_para_quien_escribe_corto() {
        let estilo = EstiloUsuario { avg_len: 8.0, ..Default::default() };
        let largo = "Primera oracion bastante larga. Segunda oracion que sobra del todo.";
        let r = imitar(largo, &estilo);
        assert!(r.chars().count() < largo.chars().count(), "no acorto: {r:?}");
        assert!(r.ends_with('.'));
    }

    #[test]
    fn imitar_no_toca_nada_sin_perfil() {
        let t = "una respuesta cualquiera";
        assert_eq!(imitar(t, &EstiloUsuario::default()), t);
    }

    // ── Generacion completa ─────────────────────────────────────────────────

    #[test]
    fn un_usuario_toxico_cambia_el_modo_amable_por_sarcastico() {
        let req = RespondRequest {
            intent: "greeting".into(), text: String::new(), jid: String::new(),
            use_humor: false, context: ctx("toxic"), history: vec![], user_style: None,
        };
        let (r, modo_usado) = generar("amable", &req);
        assert_eq!(modo_usado, "sarcastico", "deberia informar el modo que uso de verdad");
        // Y la frase tiene que salir de ESE banco, no del amable.
        let sarcastico = candidatas("sarcastico", "greeting");
        let limpia = r.trim_start_matches("Claro... ").to_string();
        assert!(
            sarcastico.iter().any(|f| limpia.contains(f.trim())),
            "la frase no parece del banco sarcastico: {r:?}",
        );
    }

    #[test]
    fn generar_nunca_devuelve_vacio() {
        for modo in &data().modes {
            for intent in ["greeting", "insult", "spam", "intencion_inventada"] {
                let req = RespondRequest {
                    intent: intent.into(), text: String::new(), jid: String::new(),
                    use_humor: true, context: ctx("normal"), history: vec![], user_style: None,
                };
                let (r, _) = generar(modo, &req);
                assert!(!r.trim().is_empty(), "{modo}/{intent} dio vacio");
            }
        }
    }

    #[test]
    fn el_humor_no_se_aplica_donde_estorba() {
        // En insultos, spam y NSFW una broma del bot lee como que le da igual.
        let d = data();
        for intent in &d.humor.avoid_intents {
            let base = "respuesta de prueba";
            for _ in 0..50 {
                assert_eq!(
                    aplicar_humor(base, "chistoso", intent),
                    base,
                    "aplico humor en {intent}",
                );
            }
        }
    }

    #[test]
    fn el_modo_formal_casi_nunca_hace_humor_y_el_chistoso_casi_siempre() {
        let base = "respuesta";
        let cuenta = |modo: &str| {
            (0..400).filter(|_| aplicar_humor(base, modo, "greeting") != base).count()
        };
        let formal = cuenta("formal");
        let chistoso = cuenta("chistoso");
        assert!(chistoso > formal, "chistoso {chistoso} deberia superar a formal {formal}");
    }
}
