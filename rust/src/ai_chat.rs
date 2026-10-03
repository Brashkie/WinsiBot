//! ai_chat.rs — generación con IA real: Ollama primero, cloud después.
//!
//! Routes: POST /ai/chat/respond, POST /ai/chat/imitate
//!
//! Portado de python/api/routers/hepein.py, python/ai/ollama_client.py y
//! python/ai/commands_ref.py. Era lo último del camino de cada mensaje que
//! seguía necesitando un intérprete, y resultó no necesitarlo: armar el prompt
//! es concatenar texto y hablar con los proveedores es HTTP.
//!
//! El catálogo de comandos (otra tabla de datos, 28 entradas) salió a
//! `assets/commands.json` e se incrusta igual que las personalidades.
//!
//! Si ninguna IA responde, el caller cae al motor local de `personality.rs`.

use axum::{extract::State, response::Json};
use regex::Regex;
use serde::Deserialize;
use std::collections::HashMap;
use std::sync::OnceLock;
use std::time::Duration;

use crate::personality::{self, Contexto, EstiloUsuario, RespondRequest, TurnoHistorial};
use crate::routes::AppState;

// ── Catálogo de comandos ─────────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct Comando {
    pub name:     String,
    #[serde(default)]
    pub aliases:  Vec<String>,
    pub category: String,
    pub usage:    String,
    pub desc:     String,
}

#[derive(Deserialize)]
pub struct Catalogo {
    pub commands:        Vec<Comando>,
    pub category_labels: HashMap<String, String>,
}

const COMANDOS_JSON: &str = include_str!("../assets/commands.json");

fn catalogo() -> &'static Catalogo {
    static C: OnceLock<Catalogo> = OnceLock::new();
    C.get_or_init(|| serde_json::from_str(COMANDOS_JSON).expect("assets/commands.json inválido"))
}

/// nombre o alias → índice en `commands`.
fn por_nombre() -> &'static HashMap<String, usize> {
    static M: OnceLock<HashMap<String, usize>> = OnceLock::new();
    M.get_or_init(|| {
        let mut m = HashMap::new();
        for (i, c) in catalogo().commands.iter().enumerate() {
            m.insert(c.name.to_lowercase(), i);
            for a in &c.aliases {
                m.insert(a.to_lowercase(), i);
            }
        }
        m
    })
}

fn re_consulta() -> &'static Regex {
    static R: OnceLock<Regex> = OnceLock::new();
    R.get_or_init(|| {
        Regex::new(
            r"(?i)\b(cómo|como|qué|que|para|cuál|cual|cuáles|cuales|usar|uso|sirve|hace|es|listar|lista|ver|mostrar|ayuda|help|comando|comandos|menu|menú|función|funciones|disponible|disponibles|tienes|tienen|existe|explicar|explicame|dime|dices|saber|quiero|puedo|puedes)\b",
        ).unwrap()
    })
}

fn re_tokens() -> &'static Regex {
    static R: OnceLock<Regex> = OnceLock::new();
    R.get_or_init(|| Regex::new(r"[\s!,?¿¡]+").unwrap())
}

/// ¿El usuario está preguntando por los comandos del bot?
pub fn es_consulta_de_comandos(prompt: &str) -> bool {
    prompt.contains('!') || re_consulta().is_match(prompt)
}

/// Bloque de texto sobre comandos para inyectar en el system prompt.
///
/// Si el usuario nombró un comando concreto va el detalle de ese; si nombró una
/// categoría, los de esa categoría; si no, un resumen de todo. El detalle
/// completo de los 28 comandos en cada prompt gastaría contexto que el modelo
/// necesita para la conversación.
pub fn seccion_comandos(prompt: &str) -> String {
    let bajo = prompt.to_lowercase();
    let cat = catalogo();

    // 1. ¿Nombró un comando o alias concreto?
    let mut encontrados: Vec<usize> = Vec::new();
    for token in re_tokens().split(&bajo) {
        let t = token.trim();
        if t.is_empty() {
            continue;
        }
        if let Some(&i) = por_nombre().get(t) {
            if !encontrados.contains(&i) {
                encontrados.push(i);
            }
        }
    }

    // 2. ¿Nombró una categoría?
    if encontrados.is_empty() {
        const CATS: [(&str, &str); 19] = [
            ("rpg", "rpg"), ("gacha", "rpg"), ("waifu", "rpg"),
            ("personajes", "rpg"), ("personaje", "rpg"),
            ("juegos", "games"), ("juego", "games"), ("arena", "games"), ("quiz", "games"),
            ("general", "general"), ("basico", "general"), ("básico", "general"),
            ("stickers", "sticker"), ("sticker", "sticker"),
            ("descargas", "downloader"), ("descargar", "downloader"), ("descarga", "downloader"),
            ("administrador", "admin"), ("admin", "admin"),
        ];
        for (palabra, c) in CATS {
            if bajo.contains(palabra) {
                encontrados = cat
                    .commands
                    .iter()
                    .enumerate()
                    .filter(|(_, cmd)| cmd.category == c)
                    .map(|(i, _)| i)
                    .collect();
                break;
            }
        }
    }

    let mut lineas = vec!["Información sobre los comandos del bot WinsiBot (prefijo !):".to_string()];

    if encontrados.is_empty() {
        // Resumen por categoría. El orden lo fija `category_labels`, que viene
        // de un mapa y no conserva orden, así que se ordena para que el prompt
        // sea el mismo entre arranques.
        let mut cats: Vec<(&String, &String)> = cat.category_labels.iter().collect();
        cats.sort_by(|a, b| a.0.cmp(b.0));
        for (clave, etiqueta) in cats {
            let nombres: Vec<String> = cat
                .commands
                .iter()
                .filter(|c| &c.category == clave)
                .map(|c| format!("!{}", c.name))
                .collect();
            if !nombres.is_empty() {
                lineas.push(format!("  {}: {}", etiqueta, nombres.join(", ")));
            }
        }
        lineas.push("El usuario puede preguntar por cualquiera de estos comandos.".into());
    } else {
        for i in encontrados {
            let c = &cat.commands[i];
            let alias = if c.aliases.is_empty() {
                String::new()
            } else {
                let a: Vec<String> = c.aliases.iter().map(|x| format!("!{x}")).collect();
                format!(" (alias: {})", a.join(", "))
            };
            lineas.push(format!("  • !{}{} — {}", c.name, alias, c.desc));
            lineas.push(format!("    Uso: {}", c.usage));
        }
    }

    lineas.push("Responde explicando cómo usar el comando de forma clara y breve.".into());
    lineas.join("\n")
}

// ── Prompts ──────────────────────────────────────────────────────────────────

/// Descripción de cada modo para el system prompt.
///
/// La lista tiene que cubrir los 12 modos de `personality.json`. En Python tuvo
/// durante un tiempo solo 6, con lo cual los otros seis caían en silencio al
/// default 'natural': el modo se guardaba bien y el motor de plantillas lo
/// respetaba, pero la IA real no reflejaba el cambio de personalidad.
fn descripcion_modo(modo: &str) -> &'static str {
    match modo {
        "amable"     => "amigable y servicial",
        "alegre"     => "energético y divertido",
        "toxico"     => "sarcástico y sin filtro",
        "sarcastico" => "irónico con humor negro suave",
        "formal"     => "profesional y educado",
        "misterioso" => "filosófico y críptico",
        "peruano"    => "peruano, usa jerga como \"causa\", \"pe\", \"bro\", \"oe\"",
        "gamer"      => "gamer, usa términos como GG, lag, noob y referencias a videojuegos",
        "amoroso"    => "cariñoso y afectuoso, con mucho cariño y emojis de corazón",
        "chistoso"   => "bromista, siempre buscando el chiste y la observación cómica",
        "depresivo"  => "apático, nihilista, con humor negro y desgano",
        "kawaii"     => "estilo anime kawaii, tierno, usa uwu/owo y onomatopeyas",
        _            => "natural",
    }
}

/// Perfil de estilo de un usuario, tal como lo devuelve `conversations.rs`.
#[derive(Debug, Default, Deserialize)]
pub struct PerfilUsuario {
    #[serde(default)]
    pub msg_count:    i64,
    #[serde(default)]
    pub avg_len:      f64,
    #[serde(default)]
    pub emoji_freq:   f64,
    #[serde(default)]
    pub common_words: Vec<String>,
    #[serde(default)]
    pub vocab_sample: Vec<String>,
    #[serde(default)]
    pub uses_slang:   bool,
}

#[derive(Debug, Default, Deserialize)]
pub struct PerfilGrupo {
    #[serde(default)]
    pub msg_count:    i64,
    #[serde(default)]
    pub common_words: Vec<String>,
    #[serde(default)]
    pub avg_msg_len:  f64,
    #[serde(default)]
    pub emoji_freq:   f64,
    #[serde(default)]
    pub vocab_sample: Vec<String>,
}

/// Cuántos mensajes hacen falta para que el perfil sea representativo.
/// Por debajo, adaptar el estilo sería ruido.
const MIN_MSGS_PERFIL: i64 = 15;
const MIN_MSGS_GRUPO:  i64 = 10;

pub fn prompt_sistema(
    grupo:    &PerfilGrupo,
    usuario:  &PerfilUsuario,
    modo:     &str,
    bot_name: &str,
    prompt:   &str,
) -> String {
    let mut p = vec![
        format!("Eres {bot_name}, la IA del bot WinsiBot en este grupo de WhatsApp."),
        format!("Tu personalidad es: {}.", descripcion_modo(modo)),
        "Responde siempre en español. Sé breve: máximo 2 frases salvo que pidan algo largo.".into(),
        String::new(),
    ];

    if grupo.msg_count >= MIN_MSGS_GRUPO {
        if !grupo.common_words.is_empty() {
            p.push(format!(
                "Vocabulario típico del grupo: {}",
                grupo.common_words.iter().take(20).cloned().collect::<Vec<_>>().join(", "),
            ));
        }
        if grupo.avg_msg_len < 30.0 {
            p.push("El grupo usa mensajes muy cortos e informales.".into());
        } else if grupo.avg_msg_len > 80.0 {
            p.push("El grupo escribe mensajes más elaborados.".into());
        }
        if grupo.emoji_freq > 0.5 {
            p.push("El grupo usa emojis con frecuencia.".into());
        }
        if !grupo.vocab_sample.is_empty() {
            p.push("Ejemplos de mensajes del grupo (SOLO para que copies el TONO, jamás el contenido):".into());
            for s in grupo.vocab_sample.iter().take(4) {
                p.push(format!("  • \"{s}\""));
            }
            p.push("IMPORTANTE: nunca repitas ni parafrasees estos ejemplos como si fueran tu respuesta — son solo referencia de cómo habla el grupo, no texto para reciclar.".into());
        }
        p.push(String::new());
    }

    if usuario.msg_count >= MIN_MSGS_PERFIL {
        p.push("El usuario que te escribe tiene este estilo de escritura:".into());
        if usuario.avg_len < 15.0 {
            p.push("  - Escribe muy corto.".into());
        } else if usuario.avg_len > 60.0 {
            p.push("  - Escribe mensajes largos.".into());
        }
        if usuario.uses_slang {
            p.push("  - Usa mucha jerga y lenguaje informal.".into());
        }
        if usuario.emoji_freq > 0.5 {
            p.push("  - Usa muchos emojis.".into());
        } else if usuario.emoji_freq < 0.05 {
            p.push("  - Casi no usa emojis.".into());
        }
        if let Some(ej) = usuario.vocab_sample.first() {
            p.push(format!(
                "  - Ejemplo de su forma de escribir (no repitas esta frase, es solo referencia de estilo): \"{ej}\"",
            ));
        }
        p.push(String::new());
    }

    if !prompt.is_empty() && es_consulta_de_comandos(prompt) {
        let s = seccion_comandos(prompt);
        if !s.is_empty() {
            p.push(s);
            p.push(String::new());
        }
    }

    p.push("Responde de forma natural, como lo haría un miembro de este grupo específico.".into());
    p.push("Generá una respuesta ORIGINAL y propia al mensaje del usuario — nunca copies, parafrasees ni reutilices los ejemplos de arriba, son solo guía de tono.".into());
    p.join("\n")
}

pub fn prompt_imitacion(perfil: &PerfilUsuario, target_jid: &str) -> String {
    let nombre = target_jid.split('@').next().unwrap_or(target_jid);
    let mut p = vec![
        format!("Responde exactamente como habla el usuario @{nombre}."),
        "Adapta: longitud del mensaje, uso de emojis, vocabulario y tono.".into(),
    ];

    if perfil.msg_count >= MIN_MSGS_PERFIL {
        if perfil.avg_len < 12.0 {
            p.push("Este usuario escribe muy corto, a veces solo 1-3 palabras.".into());
        } else if perfil.avg_len > 70.0 {
            p.push("Este usuario escribe largo y detallado.".into());
        }
        if perfil.uses_slang {
            p.push("Este usuario usa mucha jerga.".into());
        }
        if !perfil.common_words.is_empty() {
            p.push(format!(
                "Sus palabras frecuentes: {}",
                perfil.common_words.iter().take(12).cloned().collect::<Vec<_>>().join(", "),
            ));
        }
        if !perfil.vocab_sample.is_empty() {
            p.push("Ejemplos de cómo habla:".into());
            for s in perfil.vocab_sample.iter().take(5) {
                p.push(format!("  • \"{s}\""));
            }
        }
        if perfil.emoji_freq < 0.05 {
            p.push("Este usuario casi no usa emojis. No uses emojis en tu respuesta.".into());
        } else if perfil.emoji_freq > 0.6 {
            p.push("Este usuario usa muchos emojis. Incluye emojis en tu respuesta.".into());
        }
    } else {
        p.push("No hay suficientes datos del usuario, imita un estilo casual en español.".into());
    }

    p.push("Responde en máximo 2 frases.".into());
    p.join("\n")
}

// ── Proveedores ──────────────────────────────────────────────────────────────

fn env(clave: &str, por_defecto: &str) -> String {
    std::env::var(clave).unwrap_or_else(|_| por_defecto.to_string())
}

/// Timeout de Ollama. Generoso a propósito: una respuesta corta con un modelo
/// de 3B en CPU, sin GPU, tarda ~19 s medidos; con el system prompt cargado de
/// vocabulario del grupo pasa de eso fácil. Cortar antes fuerza el fallback a
/// plantillas para respuestas que iban a llegar igual.
fn ollama_timeout() -> Duration {
    Duration::from_secs_f64(env("OLLAMA_TIMEOUT", "40").parse().unwrap_or(40.0))
}

async fn cliente(timeout: Duration) -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(timeout)
        .build()
        .map_err(|e| e.to_string())
}

/// ¿Ollama está corriendo y tiene el modelo pedido?
///
/// La comparación es por el nombre sin la etiqueta: pedir "llama3.2" acepta
/// "llama3.2:3b" instalado.
pub async fn ollama_disponible(modelo: Option<&str>) -> bool {
    let objetivo = modelo.map(str::to_string).unwrap_or_else(|| env("OLLAMA_MODEL", "llama3.2:3b"));
    let base = objetivo.split(':').next().unwrap_or(&objetivo).to_string();

    let Ok(c) = cliente(Duration::from_secs(2)).await else { return false };
    let url = format!("{}/api/tags", env("OLLAMA_URL", "http://localhost:11434"));
    let Ok(r) = c.get(&url).send().await else { return false };
    if !r.status().is_success() {
        return false;
    }
    let Ok(j) = r.json::<serde_json::Value>().await else { return false };
    j.get("models")
        .and_then(|m| m.as_array())
        .map(|ms| {
            ms.iter()
                .filter_map(|m| m.get("name").and_then(|n| n.as_str()))
                .any(|n| n.contains(&base))
        })
        .unwrap_or(false)
}

async fn ollama_chat(prompt: &str, system: &str, modelo: Option<&str>) -> Option<String> {
    let objetivo = modelo.map(str::to_string).unwrap_or_else(|| env("OLLAMA_MODEL", "llama3.2:3b"));
    let c = cliente(ollama_timeout()).await.ok()?;
    // Endpoint compatible con OpenAI, igual que usaba ollama_client.py.
    let url = format!("{}/v1/chat/completions", env("OLLAMA_URL", "http://localhost:11434"));

    let r = c
        .post(&url)
        .json(&serde_json::json!({
            "model":       objetivo,
            "messages":    [
                { "role": "system", "content": system },
                { "role": "user",   "content": prompt },
            ],
            "temperature": 0.85,
            "max_tokens":  300,
            "stream":      false,
        }))
        .send()
        .await
        .map_err(|e| tracing::warn!("Ollama error: {}", e))
        .ok()?;

    if !r.status().is_success() {
        tracing::warn!("Ollama HTTP {}", r.status());
        return None;
    }
    texto_openai(&r.json::<serde_json::Value>().await.ok()?)
}

/// Extrae `choices[0].message.content`, el formato de OpenAI y de Ollama.
fn texto_openai(j: &serde_json::Value) -> Option<String> {
    let t = j
        .get("choices")?
        .get(0)?
        .get("message")?
        .get("content")?
        .as_str()?
        .trim()
        .to_string();
    (!t.is_empty()).then_some(t)
}

async fn gpt(prompt: &str, system: &str, key: &str) -> Option<String> {
    let c = cliente(Duration::from_secs(25)).await.ok()?;
    let r = c
        .post("https://api.openai.com/v1/chat/completions")
        .bearer_auth(key)
        .json(&serde_json::json!({
            "model":       "gpt-4o-mini",
            "messages":    [
                { "role": "system", "content": system },
                { "role": "user",   "content": prompt },
            ],
            "max_tokens":  300,
            "temperature": 0.85,
        }))
        .send()
        .await
        .ok()?;
    if !r.status().is_success() {
        tracing::warn!("GPT HTTP {}", r.status());
        return None;
    }
    texto_openai(&r.json::<serde_json::Value>().await.ok()?)
}

async fn gemini(prompt: &str, system: &str, key: &str) -> Option<String> {
    let c = cliente(Duration::from_secs(25)).await.ok()?;
    let url = format!(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={key}",
    );
    let r = c
        .post(&url)
        .json(&serde_json::json!({
            "contents": [{ "parts": [{ "text": format!("{system}\n\n{prompt}") }] }],
            "generationConfig": { "temperature": 0.85, "maxOutputTokens": 300 },
        }))
        .send()
        .await
        .ok()?;
    if !r.status().is_success() {
        tracing::warn!("Gemini HTTP {}", r.status());
        return None;
    }
    let j: serde_json::Value = r.json().await.ok()?;
    let t = j
        .get("candidates")?
        .get(0)?
        .get("content")?
        .get("parts")?
        .get(0)?
        .get("text")?
        .as_str()?
        .trim()
        .to_string();
    (!t.is_empty()).then_some(t)
}

async fn claude(prompt: &str, system: &str, key: &str) -> Option<String> {
    let c = cliente(Duration::from_secs(25)).await.ok()?;
    let r = c
        .post("https://api.anthropic.com/v1/messages")
        .header("x-api-key", key)
        .header("anthropic-version", "2023-06-01")
        .json(&serde_json::json!({
            "model":      "claude-haiku-4-5-20251001",
            "max_tokens": 300,
            "system":     system,
            "messages":   [{ "role": "user", "content": prompt }],
        }))
        .send()
        .await
        .ok()?;
    if !r.status().is_success() {
        tracing::warn!("Claude HTTP {}", r.status());
        return None;
    }
    let j: serde_json::Value = r.json().await.ok()?;
    let t = j.get("content")?.get(0)?.get("text")?.as_str()?.trim().to_string();
    (!t.is_empty()).then_some(t)
}

/// Pide una respuesta a la primera IA que conteste.
///
/// Con `modelo` informado —una palabra disparadora de WhatsApp pide un modelo
/// local concreto— se prueba SOLO ese y no se cae a la nube: si el usuario pidió
/// ese modelo, contestar con otro no es lo que pidió.
///
/// Sin `modelo`, el orden de siempre: Ollama (local, gratis, sin internet), GPT,
/// Gemini y Claude, cada uno solo si hay clave.
pub async fn generar_ia(
    prompt:  &str,
    system:  &str,
    use_gpt: bool,
    modelo:  Option<&str>,
) -> Option<String> {
    if let Some(m) = modelo {
        if ollama_disponible(Some(m)).await {
            if let Some(t) = ollama_chat(prompt, system, Some(m)).await {
                tracing::debug!("IA → Ollama ({})", m);
                return Some(t);
            }
        }
        return None;
    }

    if ollama_disponible(None).await {
        if let Some(t) = ollama_chat(prompt, system, None).await {
            tracing::debug!("IA → Ollama (local)");
            return Some(t);
        }
    }

    if use_gpt {
        if let Ok(k) = std::env::var("OPENAI_API_KEY") {
            if !k.is_empty() {
                if let Some(t) = gpt(prompt, system, &k).await {
                    tracing::debug!("IA → GPT");
                    return Some(t);
                }
            }
        }
    }
    if let Ok(k) = std::env::var("GEMINI_API_KEY") {
        if !k.is_empty() {
            if let Some(t) = gemini(prompt, system, &k).await {
                tracing::debug!("IA → Gemini");
                return Some(t);
            }
        }
    }
    if let Ok(k) = std::env::var("ANTHROPIC_API_KEY") {
        if !k.is_empty() {
            if let Some(t) = claude(prompt, system, &k).await {
                tracing::debug!("IA → Claude");
                return Some(t);
            }
        }
    }
    None
}

// ── Handlers ─────────────────────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct ChatRequest {
    pub prompt:     String,
    #[serde(default)]
    pub group_jid:  String,
    #[serde(default)]
    pub sender_jid: String,
    #[serde(default)]
    pub intent:     String,
    #[serde(default)]
    pub mode:       Option<String>,
    #[serde(default)]
    pub model:      Option<String>,
    #[serde(default = "si")]
    pub use_gpt:    bool,
    #[serde(default)]
    pub use_humor:  bool,
    #[serde(default)]
    pub history:    Vec<TurnoHistorial>,
    #[serde(default)]
    pub context:    Contexto,
}

fn si() -> bool { true }

/// POST /ai/chat/respond
///
/// Los perfiles de estilo salen de la misma base, acá mismo: ya no hace falta
/// que el cliente los traiga en el cuerpo como cuando esto vivía en Python.
pub async fn respond(
    State(state): State<AppState>,
    Json(req):    Json<ChatRequest>,
) -> Json<serde_json::Value> {
    let db = state.conv_db.clone();

    // Perfiles y modo, en el hilo de bloqueo porque son consultas a SQLite.
    let (sender, gjid) = (req.sender_jid.clone(), req.group_jid.clone());
    let db2 = db.clone();
    let datos = tokio::task::spawn_blocking(move || {
        let usuario = crate::conversations::user_profile(&db2, &sender, 45).ok();
        let grupo   = crate::conversations::group_profile(&db2, &gjid, 30).ok();
        let modo    = personality::modo(&db2, &gjid);
        (usuario, grupo, modo)
    })
    .await;

    let (perfil_u, perfil_g, modo_guardado) = match datos {
        Ok(d)  => d,
        Err(e) => return Json(serde_json::json!({ "success": false, "error": e.to_string() })),
    };

    let usuario = perfil_u
        .map(|p| PerfilUsuario {
            msg_count:    p.msg_count,
            avg_len:      p.avg_len,
            emoji_freq:   p.emoji_freq,
            common_words: p.common_words,
            vocab_sample: p.vocab_sample,
            uses_slang:   p.uses_slang,
        })
        .unwrap_or_default();
    let grupo = perfil_g
        .map(|g| PerfilGrupo {
            msg_count:    g.msg_count,
            common_words: g.common_words,
            avg_msg_len:  g.avg_msg_len,
            emoji_freq:   g.emoji_freq,
            vocab_sample: g.vocab_sample,
        })
        .unwrap_or_default();

    let modo = req.mode.clone().unwrap_or(modo_guardado);
    let bot_name = env("BOT_NAME", "Hepein");

    let system = prompt_sistema(&grupo, &usuario, &modo, &bot_name, &req.prompt);
    let texto = generar_ia(&req.prompt, &system, req.use_gpt, req.model.as_deref()).await;

    // Si ninguna IA contestó, el motor local de plantillas. Recibe el historial
    // para no repetir las últimas respuestas, que es lo que más delata que hay
    // una lista de frases detrás.
    let (texto, fuente) = match texto {
        Some(t) => (t, "ia"),
        None => {
            let estilo = (usuario.msg_count >= MIN_MSGS_PERFIL).then(|| EstiloUsuario {
                avg_len:      usuario.avg_len,
                emoji_freq:   usuario.emoji_freq,
                common_words: usuario.common_words.clone(),
            });
            let local = RespondRequest {
                intent:     if req.intent.is_empty() { "neutral".into() } else { req.intent.clone() },
                text:       req.prompt.clone(),
                jid:        req.group_jid.clone(),
                use_humor:  req.use_humor,
                context:    req.context.clone(),
                history:    req.history,
                user_style: estilo,
            };
            let (t, _usado) = personality::generar(&modo, &local);
            (t, "plantilla")
        }
    };

    // Y aunque haya contestado la IA, el texto se acerca al estilo del usuario.
    let texto = if usuario.msg_count >= MIN_MSGS_PERFIL {
        personality::imitar(&texto, &EstiloUsuario {
            avg_len:      usuario.avg_len,
            emoji_freq:   usuario.emoji_freq,
            common_words: usuario.common_words,
        })
    } else {
        texto
    };

    Json(serde_json::json!({
        "success": true,
        "data": {
            "text":        texto,
            "mode":        modo,
            "source":      fuente,
            "has_profile": usuario.msg_count >= MIN_MSGS_PERFIL,
            "group_msgs":  grupo.msg_count,
        }
    }))
}

#[derive(Deserialize)]
pub struct ImitateRequest {
    pub prompt:     String,
    pub target_jid: String,
}

/// POST /ai/chat/imitate — responde imitando a un usuario concreto.
pub async fn imitate(
    State(state): State<AppState>,
    Json(req):    Json<ImitateRequest>,
) -> Json<serde_json::Value> {
    let db = state.conv_db.clone();
    let target = req.target_jid.clone();

    let perfil = match tokio::task::spawn_blocking(move || {
        crate::conversations::user_profile(&db, &target, 45)
    })
    .await
    {
        Ok(Ok(p))  => PerfilUsuario {
            msg_count:    p.msg_count,
            avg_len:      p.avg_len,
            emoji_freq:   p.emoji_freq,
            common_words: p.common_words,
            vocab_sample: p.vocab_sample,
            uses_slang:   p.uses_slang,
        },
        Ok(Err(e)) => return Json(serde_json::json!({ "success": false, "error": e })),
        Err(e)     => return Json(serde_json::json!({ "success": false, "error": e.to_string() })),
    };

    let system = prompt_imitacion(&perfil, &req.target_jid);
    let texto = generar_ia(&req.prompt, &system, true, None)
        .await
        .unwrap_or_else(|| "...".into());

    let texto = if perfil.msg_count >= MIN_MSGS_PERFIL {
        personality::imitar(&texto, &EstiloUsuario {
            avg_len:      perfil.avg_len,
            emoji_freq:   perfil.emoji_freq,
            common_words: perfil.common_words,
        })
    } else {
        texto
    };

    Json(serde_json::json!({
        "success": true,
        "data": {
            "text":        texto,
            "has_profile": perfil.msg_count >= MIN_MSGS_PERFIL,
            "msg_count":   perfil.msg_count,
        }
    }))
}

// ── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    fn perfil(msgs: i64) -> PerfilUsuario {
        PerfilUsuario { msg_count: msgs, ..Default::default() }
    }

    // ── Catalogo ────────────────────────────────────────────────────────────

    #[test]
    fn el_catalogo_incrustado_carga_y_es_coherente() {
        let c = catalogo();
        assert!(!c.commands.is_empty());
        for cmd in &c.commands {
            assert!(!cmd.name.is_empty());
            assert!(!cmd.desc.is_empty(), "{} sin descripcion", cmd.name);
            assert!(!cmd.usage.is_empty(), "{} sin uso", cmd.name);
            assert!(
                c.category_labels.contains_key(&cmd.category),
                "{} usa una categoria sin etiqueta: {}", cmd.name, cmd.category,
            );
        }
    }

    #[test]
    fn el_indice_cubre_nombres_y_alias() {
        let idx = por_nombre();
        for (i, cmd) in catalogo().commands.iter().enumerate() {
            assert_eq!(idx.get(&cmd.name.to_lowercase()), Some(&i));
            for a in &cmd.aliases {
                assert_eq!(idx.get(&a.to_lowercase()), Some(&i), "alias {a} sin indexar");
            }
        }
    }

    // ── Deteccion de consultas ──────────────────────────────────────────────

    #[test]
    fn detecta_las_preguntas_sobre_comandos() {
        for p in ["como uso el bot", "que comandos tienes", "!rw", "ayuda", "dime el menu"] {
            assert!(es_consulta_de_comandos(p), "deberia detectar {p:?}");
        }
    }

    #[test]
    fn no_confunde_una_charla_normal_con_una_consulta() {
        for p in ["manana jugamos el partido", "buenas a todos", "ya llegue"] {
            assert!(!es_consulta_de_comandos(p), "no deberia detectar {p:?}");
        }
    }

    #[test]
    fn un_comando_concreto_trae_solo_su_detalle() {
        let nombre = &catalogo().commands[0].name;
        let s = seccion_comandos(&format!("como uso !{nombre}"));
        assert!(s.contains(&format!("!{nombre}")));
        assert!(s.contains("Uso:"), "deberia traer el detalle, no el resumen");
    }

    #[test]
    fn sin_nada_concreto_trae_el_resumen_por_categoria() {
        let s = seccion_comandos("que comandos hay");
        assert!(!s.contains("Uso:"), "deberia ser el resumen, no el detalle de 28 comandos");
        for etiqueta in catalogo().category_labels.values() {
            assert!(s.contains(etiqueta.as_str()), "falta la categoria {etiqueta}");
        }
    }

    #[test]
    fn la_seccion_es_estable_entre_llamadas() {
        // El orden sale de un HashMap; si no se ordenara, el prompt cambiaria
        // entre arranques y las respuestas de la IA serian irreproducibles.
        let primera = seccion_comandos("que comandos hay");
        for _ in 0..20 {
            assert_eq!(seccion_comandos("que comandos hay"), primera);
        }
    }

    // ── Prompts ─────────────────────────────────────────────────────────────

    #[test]
    fn los_doce_modos_tienen_descripcion_propia() {
        // En Python esta lista tuvo solo 6 durante un tiempo y los otros seis
        // caian en silencio a 'natural': el modo se guardaba bien pero la IA
        // real no reflejaba el cambio.
        let mut vistas = std::collections::HashSet::new();
        for m in &crate::personality::data().modes {
            let d = descripcion_modo(m);
            assert_ne!(d, "natural", "el modo {m} no tiene descripcion propia");
            assert!(vistas.insert(d), "dos modos comparten descripcion: {d}");
        }
        assert_eq!(descripcion_modo("inventado"), "natural");
    }

    #[test]
    fn el_prompt_lleva_el_nombre_y_el_modo() {
        let s = prompt_sistema(&PerfilGrupo::default(), &perfil(0), "gamer", "Hepein", "hola");
        assert!(s.contains("Hepein"));
        assert!(s.contains(descripcion_modo("gamer")));
        assert!(s.contains("español"));
    }

    #[test]
    fn el_prompt_omite_el_estilo_sin_datos_suficientes() {
        // Con pocos mensajes el perfil es ruido y describirlo haria que la IA
        // imite un estilo inventado.
        let s = prompt_sistema(&PerfilGrupo::default(), &perfil(MIN_MSGS_PERFIL - 1), "amable", "Bot", "hola");
        assert!(!s.contains("El usuario que te escribe"), "no deberia describir el estilo");
    }

    #[test]
    fn el_prompt_incluye_el_estilo_con_datos_suficientes() {
        let p = PerfilUsuario { msg_count: 100, avg_len: 8.0, uses_slang: true, ..Default::default() };
        let s = prompt_sistema(&PerfilGrupo::default(), &p, "amable", "Bot", "hola");
        assert!(s.contains("El usuario que te escribe"));
        assert!(s.contains("Escribe muy corto"));
        assert!(s.contains("jerga"));
    }

    #[test]
    fn el_prompt_avisa_de_no_reciclar_los_ejemplos() {
        let g = PerfilGrupo {
            msg_count: 100,
            vocab_sample: vec!["un mensaje de ejemplo".into()],
            ..Default::default()
        };
        let s = prompt_sistema(&g, &perfil(0), "amable", "Bot", "hola");
        assert!(s.contains("nunca repitas"), "sin ese aviso la IA recicla los ejemplos");
    }

    #[test]
    fn el_prompt_inyecta_los_comandos_solo_si_preguntan_por_ellos() {
        let con = prompt_sistema(&PerfilGrupo::default(), &perfil(0), "amable", "Bot", "que comandos hay");
        let sin = prompt_sistema(&PerfilGrupo::default(), &perfil(0), "amable", "Bot", "manana jugamos");
        assert!(con.contains("comandos del bot WinsiBot"));
        assert!(!sin.contains("comandos del bot WinsiBot"));
    }

    #[test]
    fn el_prompt_de_imitacion_usa_el_numero_y_no_el_jid_entero() {
        let s = prompt_imitacion(&perfil(0), "5190@s.whatsapp.net");
        assert!(s.contains("@5190"));
        assert!(!s.contains("s.whatsapp.net"), "no deberia filtrar el jid completo");
    }

    #[test]
    fn el_prompt_de_imitacion_avisa_cuando_no_hay_datos() {
        let s = prompt_imitacion(&perfil(0), "5190@s.whatsapp.net");
        assert!(s.contains("No hay suficientes datos"));
    }

    // ── Respuestas de los proveedores ───────────────────────────────────────

    #[test]
    fn extrae_el_texto_del_formato_de_openai() {
        let j = serde_json::json!({
            "choices": [{ "message": { "content": "  hola  " } }]
        });
        assert_eq!(texto_openai(&j), Some("hola".into()));
    }

    #[test]
    fn una_respuesta_vacia_o_rara_no_cuenta_como_respuesta() {
        // Si contara, el caller daria por buena una respuesta vacia en vez de
        // caer al motor local de plantillas.
        assert_eq!(texto_openai(&serde_json::json!({ "choices": [{ "message": { "content": "   " } }] })), None);
        assert_eq!(texto_openai(&serde_json::json!({ "choices": [] })), None);
        assert_eq!(texto_openai(&serde_json::json!({ "error": "lo que sea" })), None);
        assert_eq!(texto_openai(&serde_json::json!({})), None);
    }
}
