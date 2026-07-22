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

// ── Detección de flood de caracteres repetidos — sin regex ────────────────────
// Antes era Regex::new(r"(.)\1{7,}") — el crate `regex` de Rust NO soporta
// backreferences (\1) por diseño (los excluyó a propósito para garantizar
// tiempo lineal, a diferencia de PCRE/Python). Esa regex nunca compilaba:
// Regex::new() devolvía Err y el .unwrap() entraba en pánico la PRIMERA vez
// que /nlp/fast recibía cualquier texto no vacío — y como estaba cacheada en
// un OnceLock, si el cierre de inicialización entra en pánico la celda queda
// sin inicializar para siempre, así que volvía a pasar en CADA request
// siguiente. En la práctica esto significa que la ruta rápida de NLP en Rust
// nunca funcionó — cada llamada fallaba y (según cómo la use el lado
// TypeScript) probablemente caía siempre a Python. Detectado con
// `cargo clippy` (lint invalid_regex), confirmado en vivo contra un binario
// de prueba. clippy también marcó una segunda regex con el mismo problema en
// nonsense_re() más abajo.
fn has_repeated_char_run(text: &str, min_run: usize) -> bool {
    let mut chars = text.chars();
    let Some(mut prev) = chars.next() else { return false };
    let mut run = 1usize;
    for c in chars {
        if c == prev {
            run += 1;
            if run >= min_run {
                return true;
            }
        } else {
            prev = c;
            run = 1;
        }
    }
    false
}

/// Detecta un patrón corto (1-3 caracteres) repetido consecutivamente
/// `min_repeats` veces o más — reemplaza a la regex `(.{1,3})\1{4,}`
/// (backreference, inválida en el crate `regex`, ver comentario arriba).
/// Solo se llama con textos de <20 caracteres (ver nlp_fast), así que el
/// costo O(n²) en el peor caso es irrelevante en la práctica.
fn has_short_pattern_repeat(text: &str, min_repeats: usize) -> bool {
    let chars: Vec<char> = text.chars().collect();
    let n = chars.len();
    for pat_len in 1..=3usize {
        if pat_len.saturating_mul(min_repeats) > n {
            continue;
        }
        let mut i = 0;
        while i + pat_len * min_repeats <= n {
            let pattern = &chars[i..i + pat_len];
            let mut repeats = 1;
            let mut j = i + pat_len;
            while j + pat_len <= n && &chars[j..j + pat_len] == pattern {
                repeats += 1;
                j += pat_len;
            }
            if repeats >= min_repeats {
                return true;
            }
            i += 1;
        }
    }
    false
}

// ── Regexes compiladas una sola vez ──────────────────────────────────────────

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
    // solo consonantes 6+ chars | solo símbolos/dígitos 5+ — el tercer caso
    // (patrón corto repetido) se resuelve aparte con has_short_pattern_repeat,
    // ver comentario junto a esa función.
    R.get_or_init(|| Regex::new(r"^[^aeiouAEIOU\s]{6,}$|^[\W\d]{5,}$").unwrap())
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
    if has_repeated_char_run(text, 8) {
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
    if text.len() < 20 && (nonsense_re().is_match(text) || has_short_pattern_repeat(text, 5)) {
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
