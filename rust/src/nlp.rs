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

// Las listas de insultos y de NSFW estaban MAS CORTAS que los respaldos
// locales de TypeScript: 13 contra 35 terminos en insultos, 8 contra 16 en
// NSFW. Y eso no era solo "Rust detecta menos": para un termino que Rust no
// tenia, /nlp/fast devolvia "unknown", el lado TypeScript consultaba a Python,
// Python contestaba con un objeto valido (su vocabulario es saludo/despedida/
// ayuda/gracias/insulto/pregunta, asi que nunca podia decir "insult" ni "nsfw")
// y el `if (r)` de isToxic/isNSFW/isContentSpam daba verdadero -> devolvian
// false y la regex local NUNCA se llegaba a evaluar.
//
// O sea que esos 22 insultos y 8 terminos NSFW quedaban sin moderar, y el
// respaldo local existia sin poder actuar. Se quito el paso por Python (ver
// analyzeIntent en lib/pythonBridge.ts) y aca va la union de las dos listas,
// para que el camino rapido los agarre en sub-milisegundo en vez de depender
// de la regex de TypeScript.
fn insult_re() -> &'static Regex {
    static R: OnceLock<Regex> = OnceLock::new();
    R.get_or_init(|| {
        Regex::new(
            r"(?i)\b(mierda|idiota|estupido|inutil|asco|pendejo|hdp|ctm|puta|basura|porqueria|malparido|gonorrea|imbecil|verga|chucha|maricon|perra|zorra|carajo|cabron|capullo|cagon|pedorro|pinga|chupame|chupala|hijodeputa|hijueputa|mamahuevo|concha|coño|joto|baboso|naco|faggot|bastard|bitch|motherfucker|asshole|cunt)\b",
        ).unwrap()
    })
}

fn nsfw_re() -> &'static Regex {
    static R: OnceLock<Regex> = OnceLock::new();
    R.get_or_init(|| {
        // Los sufijos van EXPLICITOS, y eso importa: el patron envuelve el
        // grupo entre limites de palabra, asi que un prefijo suelto no
        // matchea nada. `desnud` estaba en la lista original y NUNCA
        // detecto nada: "desnudo" no tiene limite de palabra despues de
        // "desnud", y "desnud" solo no es una palabra que alguien escriba.
        // Lo encontro un test que escribi dando por bueno ese mismo
        // razonamiento equivocado para `porn`.
        Regex::new(
            r"(?i)\b(nsfw|adulto|xxx|hentai|caliente|erotico|onlyfans|porn(o|os|ografia)?|desnud(o|a|os|as)|nudes?|sexo?|putit[ao])\b",
        ).unwrap()
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
        // "chau" faltaba, y en Latinoamerica es al menos tan comun como
        // "chao" - tambien lo encontro un test.
        Regex::new(r"(?i)^(cha[ou]+|bye|adios|hasta\s+(luego|pronto)|nos\s+vemos|ciao)\b").unwrap()
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

/// Clasifica un texto. Devuelve la intención y su confianza.
///
/// Está separada del handler a propósito: así se puede probar sin montar un
/// `AppState` ni un runtime async. El pipeline va por prioridad, de lo más
/// seguro a lo menos.
///
/// "unknown" significa que no hay certeza suficiente. Hasta la 8.11.0 el lado
/// TypeScript consultaba entonces a Python, pero ese respaldo era peor que
/// nada (ver el comentario de insult_re) y se quitó: ahora cada consumidor cae
/// a su propia regex local, que es lo que siempre quiso hacer.
pub fn classify(text: &str) -> (&'static str, f64) {
    let text = text.trim();

    if text.is_empty() {
        return ("neutral", 1.0);
    }
    if has_repeated_char_run(text, 8) {
        return ("spam", 0.99);
    }
    if cmd_re().is_match(text) {
        return ("command_attempt", 0.97);
    }
    if insult_re().is_match(text) {
        return ("insult", 0.93);
    }
    if nsfw_re().is_match(text) {
        return ("nsfw", 0.93);
    }
    if greet_re().is_match(text) && text.len() < 40 {
        return ("greeting", 0.94);
    }
    if farewell_re().is_match(text) && text.len() < 40 {
        return ("farewell", 0.93);
    }
    if text.len() < 20 && (nonsense_re().is_match(text) || has_short_pattern_repeat(text, 5)) {
        return ("nonsense", 0.91);
    }

    ("unknown", 0.0)
}

pub async fn nlp_fast(
    State(_state): State<AppState>,
    Json(body):    Json<NlpBody>,
) -> (StatusCode, Json<serde_json::Value>) {
    let (intent, confidence) = classify(&body.text);
    fast_ok(intent, confidence)
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

// ── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    fn intent(text: &str) -> &'static str {
        classify(text).0
    }

    #[test]
    fn texto_vacio_es_neutral() {
        assert_eq!(intent(""), "neutral");
        assert_eq!(intent("   "), "neutral");
    }

    #[test]
    fn detecta_los_insultos_que_antes_quedaban_sin_moderar() {
        // Estos 22 estaban en la regex local de TypeScript pero NO en Rust, y
        // por el respaldo de Python la regex local nunca se llegaba a evaluar.
        for t in [
            "imbecil", "verga", "chucha", "maricon", "perra", "zorra", "carajo",
            "cabron", "capullo", "cagon", "pedorro", "pinga", "chupame", "chupala",
            "hijodeputa", "hijueputa", "mamahuevo", "concha", "coño", "joto",
            "baboso", "naco", "faggot", "bastard", "bitch", "motherfucker",
            "asshole", "cunt",
        ] {
            assert_eq!(intent(t), "insult", "deberia detectar {t:?}");
        }
    }

    #[test]
    fn sigue_detectando_los_insultos_que_ya_tenia() {
        for t in [
            "mierda", "idiota", "estupido", "inutil", "asco", "pendejo", "hdp",
            "ctm", "puta", "basura", "porqueria", "malparido", "gonorrea",
        ] {
            assert_eq!(intent(t), "insult", "deberia detectar {t:?}");
        }
    }

    #[test]
    fn los_insultos_no_distinguen_mayusculas() {
        assert_eq!(intent("IDIOTA"), "insult");
        assert_eq!(intent("Hijueputa"), "insult");
    }

    #[test]
    fn los_insultos_necesitan_palabra_completa() {
        // \b en los dos extremos: "asco" no debe disparar dentro de "bascoso",
        // ni "sex" dentro de "sexto". Es lo que evita castigar texto inocente.
        assert_eq!(intent("una frase larga sin nada raro bascoso aqui"), "unknown");
        assert_eq!(intent("llegue en el sexto puesto de la tabla final"), "unknown");
    }

    #[test]
    fn detecta_nsfw_incluidos_los_terminos_nuevos() {
        for t in ["nsfw", "porn", "porno", "xxx", "hentai", "nude", "nudes",
                  "onlyfans", "sexo", "putita", "putito", "erotico"] {
            assert_eq!(intent(t), "nsfw", "deberia detectar {t:?}");
        }
        for t in ["desnudo", "desnuda", "desnudos", "desnudas", "pornos", "pornografia"] {
            assert_eq!(intent(t), "nsfw", "deberia detectar {t:?}");
        }
        // Y el prefijo suelto NO: es justo lo que hacia que `desnud`
        // estuviera en la lista original sin llegar a detectar nada.
        assert_eq!(intent("desnud"), "unknown");
    }

    #[test]
    fn el_insulto_gana_al_nsfw_cuando_hay_los_dos() {
        // El orden del pipeline importa y es deliberado: insulto antes que
        // nsfw, porque la consecuencia (aviso y kick al cuarto) es mas dura
        // que la de nsfw (borrar) y no debe quedar tapada.
        assert_eq!(intent("idiota mandame nudes"), "insult");
    }

    #[test]
    fn el_comando_gana_al_insulto() {
        // Un comando con una palabrota adentro sigue siendo un comando: si
        // cayera en "insult", moderacion lo trataria como ofensa y el comando
        // no se ejecutaria.
        assert_eq!(intent("#ban idiota"), "command_attempt");
    }

    #[test]
    fn detecta_comandos_con_los_cuatro_prefijos() {
        for p in ['!', '#', '.', '/'] {
            assert_eq!(intent(&format!("{p}menu")), "command_attempt");
        }
        // El prefijo tiene que estar al principio.
        assert_eq!(intent("mira esto #menu que pasa aca"), "unknown");
    }

    #[test]
    fn detecta_flood_de_caracteres_repetidos() {
        assert_eq!(intent("holaaaaaaaaa"), "spam");          // 9 'a' seguidas
        assert_eq!(intent("aaaaaaaa"), "spam");              // exactamente 8
        assert_ne!(intent("aaaaaaa"), "spam");               // 7, por debajo del umbral
    }

    #[test]
    fn el_flood_gana_a_todo_lo_demas() {
        // Va primero en el pipeline: un saludo con flood es flood.
        assert_eq!(intent("holaaaaaaaaaaa"), "spam");
    }

    #[test]
    fn detecta_saludos_y_despedidas_solo_si_son_cortos() {
        assert_eq!(intent("hola"), "greeting");
        assert_eq!(intent("buenas"), "greeting");
        assert_eq!(intent("chau"), "farewell");
        // El limite de 40 caracteres evita clasificar como saludo un mensaje
        // largo que apenas empieza con "hola".
        assert_eq!(
            intent("hola, te escribo porque tengo una duda bastante larga sobre el bot"),
            "unknown",
        );
    }

    #[test]
    fn un_mensaje_normal_queda_en_unknown() {
        // Y eso esta bien: "unknown" no es un fallo, es "no hay certeza". Cada
        // consumidor del lado TypeScript cae entonces a su propia regex local.
        assert_eq!(intent("mañana a las ocho jugamos el partido en la cancha"), "unknown");
    }

    #[test]
    fn la_confianza_acompana_a_la_intension() {
        assert_eq!(classify("").1, 1.0);
        assert_eq!(classify("aaaaaaaa").1, 0.99);
        assert_eq!(classify("#menu").1, 0.97);
        assert_eq!(classify("idiota").1, 0.93);
        assert_eq!(classify("un mensaje cualquiera sin nada").1, 0.0);
    }
}
