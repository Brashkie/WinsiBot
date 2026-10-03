//! user_memory.rs — reputación y comportamiento de cada usuario.
//!
//! Routes: POST /ai/memory/{jid}/update, GET /ai/memory/{jid},
//!         GET /ai/memory/toxic
//!
//! Portado de python/ai/user_memory.py. El cálculo es el mismo; lo que cambia
//! es dónde vive.
//!
//! ── Un archivo JSON por usuario, a una tabla ────────────────────────────────
//!
//! Python guardaba cada perfil en `data/ai/users/<jid>.json`. Con los 2557
//! usuarios reales del bot eso es **2557 archivos**, cada uno reescrito entero
//! cada diez mensajes, más una caché en memoria con su propio candado y un
//! conjunto de "sucios" para el volcado periódico. Ahora es una fila en la base
//! que ya está abierta, con un UPSERT por mensaje: sin caché que invalidar, sin
//! hilo de volcado, y el estado sobrevive a un corte sin depender de que el
//! flush haya llegado a correr.
//!
//! Es el mismo movimiento que la 8.8.2 hizo con `users.json`, por el mismo
//! motivo: reescribir un archivo entero para cambiar un contador es trabajo que
//! se paga en cada mensaje.

use axum::{
    extract::{Path, State},
    response::Json,
};
use chrono::Utc;
use rusqlite::params;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::sync::OnceLock;

use crate::conversations::ConvDb;
use crate::personality::Contexto;
use crate::routes::AppState;

/// Marcadores de habla informal. Misma lista que tenía user_memory.py.
const SLANG: [&str; 23] = [
    "xd", "jaja", "jeje", "lol", "we", "wey", "bro", "men",
    "oe", "pe", "causa", "pata", "ctm", "wtf", "omg", "gg",
    "uwu", "owo", "sksksk", "ntp", "nmms", "nel", "simon",
];

fn slang() -> &'static HashSet<&'static str> {
    static S: OnceLock<HashSet<&'static str>> = OnceLock::new();
    S.get_or_init(|| SLANG.iter().copied().collect())
}

/// Cuántas intenciones recientes se recuerdan. Las usa `personality.rs` para
/// subir la intensidad de la respuesta a quien viene portándose mal.
const RECIENTES_MAX: usize = 20;

#[derive(Debug, Default, Clone, Serialize, Deserialize)]
pub struct Perfil {
    pub jid:              String,
    pub uses_slang:       bool,
    pub insult_count:     i64,
    pub spam_count:       i64,
    pub nsfw_count:       i64,
    pub command_count:    i64,
    pub msg_count:        i64,
    pub top_intents:      HashMap<String, i64>,
    pub first_seen:       i64,
    pub last_seen:        i64,
    pub active_hours:     Vec<i64>,
    pub reputation:       String,
    pub reputation_score: f64,
    pub response_style:   String,
    pub recent_intents:   Vec<String>,
}

pub fn init_schema(db: &ConvDb) {
    if let Ok(conn) = db.lock() {
        // `top_intents`, `active_hours` y `recent_intents` van como JSON en una
        // columna de texto. Son listas cortas que siempre se leen y escriben
        // enteras con el resto del perfil: normalizarlas en tablas aparte
        // costaría tres joins por mensaje para no ganar ninguna consulta.
        let r = conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS user_memory (
                jid              TEXT PRIMARY KEY,
                uses_slang       INTEGER NOT NULL DEFAULT 0,
                insult_count     BIGINT  NOT NULL DEFAULT 0,
                spam_count       BIGINT  NOT NULL DEFAULT 0,
                nsfw_count       BIGINT  NOT NULL DEFAULT 0,
                command_count    BIGINT  NOT NULL DEFAULT 0,
                msg_count        BIGINT  NOT NULL DEFAULT 0,
                top_intents      TEXT    NOT NULL DEFAULT '{}',
                first_seen       BIGINT  NOT NULL DEFAULT 0,
                last_seen        BIGINT  NOT NULL DEFAULT 0,
                active_hours     TEXT    NOT NULL DEFAULT '[]',
                reputation       TEXT    NOT NULL DEFAULT 'normal',
                reputation_score REAL    NOT NULL DEFAULT 50.0,
                response_style   TEXT    NOT NULL DEFAULT 'neutral',
                recent_intents   TEXT    NOT NULL DEFAULT '[]'
            );
            -- Para /ai/memory/toxic, que lista a los peores.
            CREATE INDEX IF NOT EXISTS idx_user_memory_rep
                ON user_memory(reputation, reputation_score);",
        );
        if let Err(e) = r {
            tracing::warn!("SQLite schema init error (user_memory): {}", e);
        }
    }
}

fn json_a<T: for<'de> Deserialize<'de> + Default>(s: &str) -> T {
    serde_json::from_str(s).unwrap_or_default()
}

fn leer(db: &ConvDb, jid: &str) -> Result<Perfil, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    let r = conn.query_row(
        "SELECT uses_slang, insult_count, spam_count, nsfw_count, command_count,
                msg_count, top_intents, first_seen, last_seen, active_hours,
                reputation, reputation_score, response_style, recent_intents
           FROM user_memory WHERE jid = ?1",
        params![jid],
        |r| {
            Ok(Perfil {
                jid:              jid.to_string(),
                uses_slang:       r.get::<_, i64>(0)? != 0,
                insult_count:     r.get(1)?,
                spam_count:       r.get(2)?,
                nsfw_count:       r.get(3)?,
                command_count:    r.get(4)?,
                msg_count:        r.get(5)?,
                top_intents:      json_a(&r.get::<_, String>(6)?),
                first_seen:       r.get(7)?,
                last_seen:        r.get(8)?,
                active_hours:     json_a(&r.get::<_, String>(9)?),
                reputation:       r.get(10)?,
                reputation_score: r.get(11)?,
                response_style:   r.get(12)?,
                recent_intents:   json_a(&r.get::<_, String>(13)?),
            })
        },
    );

    match r {
        Ok(p) => Ok(p),
        // Usuario nuevo: un perfil en blanco, no un error.
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(Perfil {
            jid:              jid.to_string(),
            reputation:       "normal".into(),
            reputation_score: 50.0,
            response_style:   "neutral".into(),
            ..Default::default()
        }),
        Err(e) => Err(e.to_string()),
    }
}

fn escribir(db: &ConvDb, p: &Perfil) -> Result<(), String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO user_memory
            (jid, uses_slang, insult_count, spam_count, nsfw_count, command_count,
             msg_count, top_intents, first_seen, last_seen, active_hours,
             reputation, reputation_score, response_style, recent_intents)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15)
         ON CONFLICT(jid) DO UPDATE SET
            uses_slang = excluded.uses_slang, insult_count = excluded.insult_count,
            spam_count = excluded.spam_count, nsfw_count = excluded.nsfw_count,
            command_count = excluded.command_count, msg_count = excluded.msg_count,
            top_intents = excluded.top_intents, last_seen = excluded.last_seen,
            active_hours = excluded.active_hours, reputation = excluded.reputation,
            reputation_score = excluded.reputation_score,
            response_style = excluded.response_style,
            recent_intents = excluded.recent_intents",
        params![
            p.jid,
            i64::from(p.uses_slang),
            p.insult_count, p.spam_count, p.nsfw_count, p.command_count, p.msg_count,
            serde_json::to_string(&p.top_intents).unwrap_or_else(|_| "{}".into()),
            p.first_seen, p.last_seen,
            serde_json::to_string(&p.active_hours).unwrap_or_else(|_| "[]".into()),
            p.reputation, p.reputation_score, p.response_style,
            serde_json::to_string(&p.recent_intents).unwrap_or_else(|_| "[]".into()),
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// Reputación de 0 a 100 y su etiqueta.
///
/// Las penalizaciones son por TASA, no por cantidad: quien insultó tres veces
/// en mil mensajes no es lo mismo que quien insultó tres veces en cinco.
///
/// El umbral de `trusted` es 70 y no 80 como en user_memory.py, porque con 80
/// **esa categoría era inalcanzable**: se parte de 50 y los tres bonos suman
/// como máximo +20 (5 por pasar 50 mensajes, 10 por pasar 200 y 5 por pasar 20
/// comandos), con lo cual el techo real es 70 y las penalizaciones solo restan.
/// Ningún usuario podía ser `trusted` por mucho que se portara bien — y
/// `personality.rs` sí usa esa etiqueta, para bajar la intensidad de las
/// respuestas a 0.3. Lo encontró un test que daba por supuesto que las cuatro
/// categorías eran alcanzables.
///
/// Con 70, `trusted` requiere el máximo: más de 200 mensajes, más de 20
/// comandos y ninguna infracción.
pub fn reputacion(p: &Perfil) -> (f64, &'static str) {
    let mut score = 50.0_f64;

    if p.msg_count > 50 { score += 5.0; }
    if p.msg_count > 200 { score += 10.0; }
    if p.command_count > 20 { score += 5.0; }

    let total = p.msg_count.max(1) as f64;
    score -= (p.insult_count as f64 / total) * 40.0;
    score -= (p.spam_count   as f64 / total) * 30.0;
    score -= (p.nsfw_count   as f64 / total) * 20.0;

    let score = (score.clamp(0.0, 100.0) * 10.0).round() / 10.0;
    let etiqueta = if score >= 70.0 {
        "trusted"
    } else if score >= 50.0 {
        "normal"
    } else if score >= 25.0 {
        "suspicious"
    } else {
        "toxic"
    };
    (score, etiqueta)
}

/// Qué tono prefiere este usuario, deducido de lo que suele escribir.
pub fn estilo_respuesta(p: &Perfil) -> &'static str {
    if p.reputation == "toxic" || p.reputation == "suspicious" {
        return "sarcastic";
    }
    let n = |k: &str| p.top_intents.get(k).copied().unwrap_or(0);
    let (joke, praise, quejas) = (n("joke"), n("praise"), n("complaint"));

    if joke > quejas && joke > 3 {
        "humor"
    } else if praise > 3 {
        "friendly"
    } else if quejas > joke && quejas > 3 {
        "formal"
    } else if p.uses_slang {
        "humor"
    } else {
        "neutral"
    }
}

fn tiene_jerga(texto: &str) -> bool {
    texto
        .to_lowercase()
        .split_whitespace()
        .any(|w| slang().contains(w))
}

#[derive(Deserialize)]
pub struct UpdateRequest {
    pub text:   String,
    #[serde(default)]
    pub intent: String,
    #[serde(default)]
    pub is_cmd: bool,
}

/// Registra un mensaje y devuelve el perfil ya actualizado.
pub fn actualizar(db: &ConvDb, jid: &str, req: &UpdateRequest) -> Result<Perfil, String> {
    let mut p = leer(db, jid)?;
    let ahora = Utc::now();
    let ts = ahora.timestamp_millis();

    p.msg_count += 1;
    p.last_seen = ts;
    if p.first_seen == 0 {
        p.first_seen = ts;
    }

    // Hora UTC, igual que el perfil de estilo de conversations.rs: lo que
    // interesa es el patrón relativo, no la hora de pared de nadie.
    let hora = ((ts / 3_600_000) % 24) as i64;
    if !p.active_hours.contains(&hora) {
        p.active_hours.push(hora);
        p.active_hours.sort_unstable();
    }

    if tiene_jerga(&req.text) {
        p.uses_slang = true;
    }

    let intent = if req.intent.is_empty() { "neutral" } else { req.intent.as_str() };
    *p.top_intents.entry(intent.to_string()).or_insert(0) += 1;

    p.recent_intents.push(intent.to_string());
    if p.recent_intents.len() > RECIENTES_MAX {
        let sobran = p.recent_intents.len() - RECIENTES_MAX;
        p.recent_intents.drain(..sobran);
    }

    match intent {
        "insult" => p.insult_count += 1,
        "spam"   => p.spam_count += 1,
        "nsfw"   => p.nsfw_count += 1,
        _ => {}
    }
    if req.is_cmd {
        p.command_count += 1;
    }

    let (score, etiqueta) = reputacion(&p);
    p.reputation_score = score;
    p.reputation = etiqueta.to_string();
    p.response_style = estilo_respuesta(&p).to_string();

    // Se escribe en CADA mensaje, no cada diez como hacía Python. Es un UPSERT
    // sobre una conexión ya abierta; lo que Python ahorraba con el volcado
    // diferido era reescribir un archivo JSON entero, que acá no existe.
    escribir(db, &p)?;
    Ok(p)
}

/// El resumen que `personality.rs` necesita para adaptar el tono.
pub fn contexto(p: &Perfil) -> Contexto {
    Contexto {
        reputation:     p.reputation.clone(),
        response_style: p.response_style.clone(),
        recent_intents: p.recent_intents.clone(),
        uses_slang:     p.uses_slang,
    }
}

// ── Handlers ─────────────────────────────────────────────────────────────────

pub async fn update(
    State(state): State<AppState>,
    Path(jid):    Path<String>,
    Json(req):    Json<UpdateRequest>,
) -> Json<serde_json::Value> {
    let db = state.conv_db.clone();
    match tokio::task::spawn_blocking(move || actualizar(&db, &jid, &req)).await {
        Ok(Ok(p))  => Json(serde_json::json!({ "success": true, "data": p })),
        Ok(Err(e)) => Json(serde_json::json!({ "success": false, "error": e })),
        Err(e)     => Json(serde_json::json!({ "success": false, "error": e.to_string() })),
    }
}

pub async fn get(
    State(state): State<AppState>,
    Path(jid):    Path<String>,
) -> Json<serde_json::Value> {
    let db = state.conv_db.clone();
    match tokio::task::spawn_blocking(move || leer(&db, &jid)).await {
        Ok(Ok(p))  => Json(serde_json::json!({ "success": true, "data": p })),
        Ok(Err(e)) => Json(serde_json::json!({ "success": false, "error": e })),
        Err(e)     => Json(serde_json::json!({ "success": false, "error": e.to_string() })),
    }
}

/// GET /ai/memory/toxic — los peores, de peor a mejor.
pub async fn toxic(State(state): State<AppState>) -> Json<serde_json::Value> {
    let db = state.conv_db.clone();

    let res = tokio::task::spawn_blocking(move || -> Result<Vec<(String, f64)>, String> {
        let conn = db.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare(
                "SELECT jid, reputation_score FROM user_memory
                  WHERE reputation = 'toxic'
                  ORDER BY reputation_score ASC LIMIT 50",
            )
            .map_err(|e| e.to_string())?;
        let filas = stmt
            .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, f64>(1)?)))
            .map_err(|e| e.to_string())?;
        Ok(filas.filter_map(Result::ok).collect())
    })
    .await;

    match res {
        Ok(Ok(v)) => Json(serde_json::json!({
            "success": true,
            "data": v.into_iter()
                .map(|(jid, score)| serde_json::json!({ "jid": jid, "score": score }))
                .collect::<Vec<_>>(),
        })),
        Ok(Err(e)) => Json(serde_json::json!({ "success": false, "error": e })),
        Err(e)     => Json(serde_json::json!({ "success": false, "error": e.to_string() })),
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

    fn msg(texto: &str, intent: &str) -> UpdateRequest {
        UpdateRequest { text: texto.into(), intent: intent.into(), is_cmd: false }
    }

    #[test]
    fn un_usuario_nuevo_arranca_neutral() {
        let p = leer(&db(), "nadie@s").unwrap();
        assert_eq!(p.msg_count, 0);
        assert_eq!(p.reputation, "normal");
        assert_eq!(p.reputation_score, 50.0);
        assert_eq!(p.response_style, "neutral");
        assert!(!p.uses_slang);
    }

    #[test]
    fn el_perfil_persiste_entre_llamadas() {
        let db = db();
        actualizar(&db, "a@s", &msg("hola", "greeting")).unwrap();
        actualizar(&db, "a@s", &msg("que tal", "greeting")).unwrap();
        assert_eq!(leer(&db, "a@s").unwrap().msg_count, 2);
    }

    #[test]
    fn los_perfiles_no_se_mezclan() {
        let db = db();
        actualizar(&db, "a@s", &msg("hola", "greeting")).unwrap();
        actualizar(&db, "b@s", &msg("hola", "greeting")).unwrap();
        actualizar(&db, "b@s", &msg("hola", "greeting")).unwrap();
        assert_eq!(leer(&db, "a@s").unwrap().msg_count, 1);
        assert_eq!(leer(&db, "b@s").unwrap().msg_count, 2);
    }

    #[test]
    fn detecta_la_jerga_y_no_la_desactiva_despues() {
        let db = db();
        actualizar(&db, "a@s", &msg("buenas tardes", "greeting")).unwrap();
        assert!(!leer(&db, "a@s").unwrap().uses_slang);

        actualizar(&db, "a@s", &msg("jaja causa que tal", "neutral")).unwrap();
        assert!(leer(&db, "a@s").unwrap().uses_slang);

        // Un mensaje formal despues no borra lo que ya se sabe del usuario.
        actualizar(&db, "a@s", &msg("estimado senor", "neutral")).unwrap();
        assert!(leer(&db, "a@s").unwrap().uses_slang);
    }

    #[test]
    fn cuenta_las_intenciones_negativas_por_separado() {
        let db = db();
        actualizar(&db, "a@s", &msg("idiota", "insult")).unwrap();
        actualizar(&db, "a@s", &msg("idiota", "insult")).unwrap();
        actualizar(&db, "a@s", &msg("aaaa", "spam")).unwrap();
        let p = leer(&db, "a@s").unwrap();
        assert_eq!(p.insult_count, 2);
        assert_eq!(p.spam_count, 1);
        assert_eq!(p.nsfw_count, 0);
    }

    #[test]
    fn las_intenciones_recientes_se_acotan() {
        let db = db();
        for _ in 0..(RECIENTES_MAX + 10) {
            actualizar(&db, "a@s", &msg("hola", "greeting")).unwrap();
        }
        assert_eq!(leer(&db, "a@s").unwrap().recent_intents.len(), RECIENTES_MAX);
    }

    #[test]
    fn la_reputacion_penaliza_por_tasa_y_no_por_cantidad() {
        // Tres insultos en cinco mensajes es muy distinto de tres en mil.
        let pocos = Perfil { msg_count: 5, insult_count: 3, ..Default::default() };
        let muchos = Perfil { msg_count: 1000, insult_count: 3, ..Default::default() };
        assert!(reputacion(&pocos).0 < reputacion(&muchos).0);
    }

    #[test]
    fn la_reputacion_da_las_cuatro_etiquetas() {
        // "trusted" tiene que ser ALCANZABLE: con el umbral original de 80 no
        // lo era, porque el techo real del calculo es 70.
        assert_eq!(reputacion(&Perfil { msg_count: 300, command_count: 30, ..Default::default() }).1, "trusted");
        assert_eq!(reputacion(&Perfil { msg_count: 10, ..Default::default() }).1, "normal");
        assert_eq!(reputacion(&Perfil { msg_count: 10, insult_count: 1, ..Default::default() }).1, "suspicious");
        assert_eq!(reputacion(&Perfil { msg_count: 10, insult_count: 9, spam_count: 5, ..Default::default() }).1, "toxic");
    }

    #[test]
    fn el_techo_de_la_reputacion_alcanza_para_trusted() {
        // Si alguien vuelve a tocar los bonos o el umbral, esto avisa: el
        // mejor usuario posible tiene que llegar a "trusted".
        let mejor = Perfil { msg_count: 100_000, command_count: 10_000, ..Default::default() };
        let (score, etiqueta) = reputacion(&mejor);
        assert_eq!(etiqueta, "trusted", "el techo real es {score}");
    }

    #[test]
    fn la_reputacion_no_se_sale_del_rango() {
        let pesimo = Perfil { msg_count: 10, insult_count: 10, spam_count: 10, nsfw_count: 10, ..Default::default() };
        let optimo = Perfil { msg_count: 10_000, command_count: 1000, ..Default::default() };
        assert!((0.0..=100.0).contains(&reputacion(&pesimo).0));
        assert!((0.0..=100.0).contains(&reputacion(&optimo).0));
    }

    #[test]
    fn un_usuario_toxico_recibe_estilo_sarcastico() {
        let p = Perfil { reputation: "toxic".into(), ..Default::default() };
        assert_eq!(estilo_respuesta(&p), "sarcastic");
    }

    #[test]
    fn el_estilo_sale_de_las_intenciones_frecuentes() {
        let mut p = Perfil { reputation: "normal".into(), ..Default::default() };
        p.top_intents.insert("joke".into(), 10);
        assert_eq!(estilo_respuesta(&p), "humor");

        let mut q = Perfil { reputation: "normal".into(), ..Default::default() };
        q.top_intents.insert("complaint".into(), 10);
        assert_eq!(estilo_respuesta(&q), "formal");

        let mut r = Perfil { reputation: "normal".into(), ..Default::default() };
        r.top_intents.insert("praise".into(), 10);
        assert_eq!(estilo_respuesta(&r), "friendly");
    }

    #[test]
    fn insultar_mucho_hunde_la_reputacion_de_verdad() {
        let db = db();
        for _ in 0..10 {
            actualizar(&db, "a@s", &msg("idiota", "insult")).unwrap();
        }
        let p = leer(&db, "a@s").unwrap();
        assert_eq!(p.reputation, "toxic", "score {}", p.reputation_score);
        assert_eq!(p.response_style, "sarcastic");
    }

    #[test]
    fn el_contexto_lleva_lo_que_personality_necesita() {
        let db = db();
        actualizar(&db, "a@s", &msg("jaja causa", "joke")).unwrap();
        let c = contexto(&leer(&db, "a@s").unwrap());
        assert!(c.uses_slang);
        assert_eq!(c.reputation, "normal");
        assert_eq!(c.recent_intents, vec!["joke"]);
    }

    #[test]
    fn una_intencion_vacia_cuenta_como_neutral() {
        let db = db();
        actualizar(&db, "a@s", &UpdateRequest { text: "hola".into(), intent: String::new(), is_cmd: false }).unwrap();
        let p = leer(&db, "a@s").unwrap();
        assert_eq!(p.top_intents.get("neutral"), Some(&1));
    }

    #[test]
    fn los_comandos_se_cuentan_aparte() {
        let db = db();
        actualizar(&db, "a@s", &UpdateRequest { text: "#menu".into(), intent: "command_attempt".into(), is_cmd: true }).unwrap();
        actualizar(&db, "a@s", &msg("hola", "greeting")).unwrap();
        let p = leer(&db, "a@s").unwrap();
        assert_eq!(p.command_count, 1);
        assert_eq!(p.msg_count, 2);
    }

    #[test]
    fn first_seen_se_fija_una_sola_vez() {
        let db = db();
        actualizar(&db, "a@s", &msg("hola", "greeting")).unwrap();
        let primero = leer(&db, "a@s").unwrap().first_seen;
        assert!(primero > 0);
        actualizar(&db, "a@s", &msg("otra", "neutral")).unwrap();
        assert_eq!(leer(&db, "a@s").unwrap().first_seen, primero);
    }
}
