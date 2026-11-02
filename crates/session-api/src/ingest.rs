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

/// Clasifica y encola el mensaje observado; devuelve la clasificación y la
/// actualización de memoria que le toca, para que el llamador la mande a un
/// hilo bloqueante —una por mensaje, o una por lote—.
fn procesar(state: &AppState, req: IngestRequest) -> (&'static str, f64, (String, UpdateRequest)) {
    let (intent, confidence) = classify(&req.text);

    if req.observar && !req.gjid.is_empty() {
        let pendientes = observar(
            &state.conv_db,
            ObserveRequest {
                sender: req.sender.clone(),
                gjid: req.gjid,
                text: req.text.clone(),
            },
        );
        // Como en /ai/observe: una ráfaga grande se vacía ya.
        if pendientes >= 512 {
            let db = state.conv_db.clone();
            tokio::task::spawn_blocking(move || db.vaciar_pendientes());
        }
    }

    // Un intent "unknown" cuenta como neutral, que es lo que el bot mandaba
    // cuando /nlp/fast no reconocía nada.
    let memoria = UpdateRequest {
        text: req.text,
        intent: if intent == "unknown" {
            "neutral".into()
        } else {
            intent.into()
        },
        is_cmd: req.is_cmd,
    };
    (intent, confidence, (req.sender, memoria))
}

/// La memoria puede tener que leer el perfil de SQLite: en un hilo bloqueante
/// y sin esperarla.
fn actualizar_memorias(state: &AppState, memorias: Vec<(String, UpdateRequest)>) {
    let db = state.conv_db.clone();
    tokio::task::spawn_blocking(move || {
        for (jid, m) in &memorias {
            let _ = actualizar(&db, jid, m);
        }
    });
}

pub async fn ingest(
    State(state): State<AppState>,
    Json(req): Json<IngestRequest>,
) -> Json<serde_json::Value> {
    let (intent, confidence, memoria) = procesar(&state, req);
    actualizar_memorias(&state, vec![memoria]);
    Json(serde_json::json!({ "ok": true, "intent": intent, "confidence": confidence }))
}

#[derive(Deserialize)]
pub struct IngestLote {
    pub items: Vec<IngestRequest>,
}

/// Tope de mensajes por lote: el bot manda como mucho 64 (ver
/// `ingerirMensaje` en nativeBridge.ts); esto es solo un techo.
const MAX_LOTE: usize = 256;

/// POST /msg/ingest/batch — lo mismo que /msg/ingest para varios mensajes en
/// un viaje, con las respuestas en el mismo orden. Las memorias del lote van
/// juntas a un solo hilo bloqueante, en vez de un salto de hilo por mensaje.
pub async fn ingest_lote(
    State(state): State<AppState>,
    Json(lote): Json<IngestLote>,
) -> Json<serde_json::Value> {
    if lote.items.len() > MAX_LOTE {
        return Json(
            serde_json::json!({ "ok": false, "error": format!("más de {MAX_LOTE} mensajes") }),
        );
    }
    let mut resultados = Vec::with_capacity(lote.items.len());
    let mut memorias = Vec::with_capacity(lote.items.len());
    for req in lote.items {
        let (intent, confidence, memoria) = procesar(&state, req);
        resultados.push(serde_json::json!({ "intent": intent, "confidence": confidence }));
        memorias.push(memoria);
    }
    actualizar_memorias(&state, memorias);
    Json(serde_json::json!({ "ok": true, "resultados": resultados }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn un_lote_es_una_lista_de_mensajes() {
        let l: IngestLote = serde_json::from_str(
            r#"{"items":[{"sender":"a@s.whatsapp.net","text":"hola"},{"sender":"b@s.whatsapp.net","gjid":"g@g.us","text":"xd","observar":true}]}"#,
        )
        .unwrap();
        assert_eq!(l.items.len(), 2);
        assert!(l.items[1].observar);
    }

    #[test]
    fn el_cuerpo_minimo_es_remitente_y_texto() {
        let r: IngestRequest =
            serde_json::from_str(r#"{"sender":"a@s.whatsapp.net","text":"hola"}"#).unwrap();
        assert!(r.gjid.is_empty() && !r.is_cmd && !r.observar);
    }
}
