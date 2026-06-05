//! nlp.rs — Fast rule-based NLP pre-processor
//!
//! Detecta intenciones obvias (spam, saludo, comando, insulto, nsfw) en Rust
//! antes de enviar a Python. Sub-milisegundo, sin ML.
//!
//! TypeScript llama POST /nlp/fast → si intent != "unknown" lo usa directamente,
//! si intent == "unknown" delega a Python /api/v1/intent/classify.

use axum::{extract::State, http::StatusCode, response::Json};
use chrono::Utc;
use regex::Regex;
use serde::Deserialize;
use std::sync::OnceLock;

use crate::routes::AppState;

// ── Regexes compiladas una sola vez ──────────────────────────────────────────

fn spam_re() -> &'static Regex {
    static R: OnceLock<Regex> = OnceLock::new();
    R.get_or_init(|| Regex::new(r"(.)\1{7,}").unwrap())
}

fn cmd_re() -> &'static Regex {
    static R: OnceLock<Regex> = OnceLock::new();
    R.get_or_init(|| Regex::new(r"^[!#./]\w+").unwrap())
}

fn insult_re() -> &'static Regex {
    static R: OnceLock<Regex> = OnceLock::new();
    R.get_or_init(|| {
        Regex::new(
            r"(?i)\b(mierda|idiota|estupido|inutil|asco|pendejo|hdp|ctm|puta|basura|porqueria|malparido|gonorrea)\b",
        ).unwrap()
    })
}

fn nsfw_re() -> &'static Regex {
    static R: OnceLock<Regex> = OnceLock::new();
    R.get_or_init(|| {
        Regex::new(r"(?i)\b(nsfw|adulto|porn|xxx|desnud|hentai|caliente|erotico)\b").unwrap()
    })
}

fn greet_re() -> &'static Regex {
    static R: OnceLock<Regex> = OnceLock::new();
    R.get_or_init(|| {
        Regex::new(r"(?i)^(hola+|ola+|hey+|buenas?|saludos?|hi|hello|wenas?)\b").unwrap()
    })
}

fn farewell_re() -> &'static Regex {
    static R: OnceLock<Regex> = OnceLock::new();
    R.get_or_init(|| {
        Regex::new(r"(?i)^(chao+|bye|adios|hasta\s+(luego|pronto)|nos\s+vemos|ciao)\b").unwrap()
    })
}

fn nonsense_re() -> &'static Regex {
    static R: OnceLock<Regex> = OnceLock::new();
    // solo consonantes 6+ chars | solo símbolos/dígitos 5+ | patrón corto repetido 4+
    R.get_or_init(|| {
        Regex::new(r"^[^aeiouAEIOU\s]{6,}$|^[\W\d]{5,}$|(.{1,3})\1{4,}").unwrap()
    })
}

// ── Request body ──────────────────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct NlpBody {
    pub text: String,
}

// ── Handler ───────────────────────────────────────────────────────────────────

pub async fn nlp_fast(
    State(_state): State<AppState>,
    Json(body):    Json<NlpBody>,
) -> (StatusCode, Json<serde_json::Value>) {
    let text = body.text.trim();

    if text.is_empty() {
        return fast_ok("neutral", 1.0);
    }

    // Pipeline por prioridad — primero los más seguros
    if spam_re().is_match(text) {
        return fast_ok("spam", 0.99);
    }
    if cmd_re().is_match(text) {
        return fast_ok("command_attempt", 0.97);
    }
    if insult_re().is_match(text) {
        return fast_ok("insult", 0.93);
    }
    if nsfw_re().is_match(text) {
        return fast_ok("nsfw", 0.93);
    }
    if greet_re().is_match(text) && text.len() < 40 {
        return fast_ok("greeting", 0.94);
    }
    if farewell_re().is_match(text) && text.len() < 40 {
        return fast_ok("farewell", 0.93);
    }
    if nonsense_re().is_match(text) && text.len() < 20 {
        return fast_ok("nonsense", 0.91);
    }

    // No hay suficiente certeza — delegar a Python
    (
        StatusCode::OK,
        Json(serde_json::json!({
            "ok":         true,
            "intent":     "unknown",
            "confidence": 0.0,
            "method":     "rule",
            "ts":         Utc::now(),
        })),
    )
}

fn fast_ok(intent: &str, conf: f64) -> (StatusCode, Json<serde_json::Value>) {
    (
        StatusCode::OK,
        Json(serde_json::json!({
            "ok":         true,
            "intent":     intent,
            "confidence": conf,
            "method":     "rule",
            "ts":         Utc::now(),
        })),
    )
}
