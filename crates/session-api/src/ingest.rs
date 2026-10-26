//! POST /msg/ingest — lo que el bot le pide a la Session API por cada mensaje
//! de grupo, en UN viaje.
//!
//! Hasta la 8.17.0 eran tres peticiones por mensaje: `/nlp/fast` (clasificar),
//! `/ai/observe` (guardarlo para el estilo del grupo) y `/ai/memory/:jid/update`
//! (la memoria del remitente). Medido con `npm run bench:api`, el piso de
//! CUALQUIER petición —la capa HTTP, el JSON, tokio— ronda los 50 µs de CPU en
//! Rust, más lo que paga Node de su lado: tres pisos por mensaje para un trabajo
//! de unos pocos µs. Acá se paga uno.
//!
//! Hace lo mismo que las tres, en el mismo orden: clasifica, encola el mensaje
//! observado y actualiza la memoria. La memoria va en segundo plano, como
//! antes iba en Node (fire-and-forget): la respuesta vuelve apenas está la
//! clasificación, que es lo único que el bot espera.
//!
//! `/rate/check` queda aparte a propósito: el bot lo pregunta al principio, y
//! lo de acá recién después de los filtros (antispam, baneados). Juntarlos
//! haría guardar mensajes que hoy se descartan.

use axum::{extract::State, Json};
use serde::Deserialize;

use crate::conversations::{observar, ObserveRequest};
use crate::nlp::classify;
use crate::routes::AppState;
use crate::user_memory::{actualizar, UpdateRequest};

#[derive(Deserialize)]
pub struct IngestRequest {
    pub sender: String,
    /// El grupo; vacío en privado, y entonces no se observa.
    #[serde(default)]
    pub gjid: String,
    pub text: String,
    #[serde(default)]
    pub is_cmd: bool,
    /// Si se guarda para el estilo del grupo (el bot no guarda textos de
    /// menos de 3 caracteres).
    #[serde(default)]
    pub observar: bool,
}

pub async fn ingest(State(state): State<AppState>, Json(req): Json<IngestRequest>) -> Json<serde_json::Value> {
    let (intent, confidence) = classify(&req.text);

    if req.observar && !req.gjid.is_empty() {
        let pendientes = observar(
            &state.conv_db,
            ObserveRequest { sender: req.sender.clone(), gjid: req.gjid, text: req.text.clone() },
        );
        // Como en /ai/observe: una ráfaga grande se vacía ya.
        if pendientes >= 512 {
            let db = state.conv_db.clone();
            tokio::task::spawn_blocking(move || db.vaciar_pendientes());
        }
    }

    // La memoria puede tener que leer el perfil de SQLite: en un hilo
    // bloqueante y sin esperarla. Un intent "unknown" cuenta como neutral, que
    // es lo que el bot mandaba cuando /nlp/fast no reconocía nada.
    let db = state.conv_db.clone();
    let memoria = UpdateRequest {
        text: req.text,
        intent: if intent == "unknown" { "neutral".into() } else { intent.into() },
        is_cmd: req.is_cmd,
    };
    let jid = req.sender;
    tokio::task::spawn_blocking(move || {
        let _ = actualizar(&db, &jid, &memoria);
    });

    Json(serde_json::json!({ "ok": true, "intent": intent, "confidence": confidence }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn el_cuerpo_minimo_es_remitente_y_texto() {
        let r: IngestRequest = serde_json::from_str(r#"{"sender":"a@s.whatsapp.net","text":"hola"}"#).unwrap();
        assert!(r.gjid.is_empty() && !r.is_cmd && !r.observar);
    }
}
