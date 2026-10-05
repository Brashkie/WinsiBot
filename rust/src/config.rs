use std::env;

// Techo de tamaño para un archivo/blob de sesión — antes declarado dos veces
// por separado (atomic.rs para el tamaño en disco antes de leer, routes.rs
// para el buffer ya en memoria), mismo valor, mismo comentario "10 MB", sin
// nada que garantizara que se movieran juntos si alguna vez cambiaba.
pub const MAX_SESSION_BYTES: usize = 10_000_000;

/// El puerto de una URL como `http://127.0.0.1:18080` o `https://host:9000/x`.
///
/// A mano y no con una crate de URLs, porque es lo único que hace falta de una
/// y este es el único sitio que lo necesita. Devuelve `None` si la URL no trae
/// puerto explícito: ahí no se puede adivinar en cuál escuchar.
fn puerto_de_url(url: &str) -> Option<u16> {
    let sin_esquema = url.split("//").nth(1).unwrap_or(url);
    let autoridad   = sin_esquema.split('/').next()?;
    autoridad.rsplit_once(':')?.1.parse().ok()
}

#[derive(Clone, Debug)]
pub struct Config {
    pub port:              u16,
    pub api_key:           String,
    pub sessions_dir:      String,
    pub auth_dir:          String,
    pub db_path:           String,
    pub conv_db_path:      String,
    pub alert_webhook_url: Option<String>,
}

impl Config {
    pub fn load() -> Self {
        let _ = dotenvy::dotenv();

        // ── Un solo nombre para la clave, y un solo sitio para el puerto ─────
        //
        // Esto estaba roto de una forma que no se veía. El servidor leía
        // `API_KEY` y `PORT`; el cliente de TypeScript (`lib/session.ts`) usa
        // `SESSION_API_KEY` y `SESSION_API_URL`, y `.env.example` documenta
        // esos dos y **ninguno** de los primeros. O sea que siguiendo el
        // ejemplo al pie de la letra la API no arrancaba: panic al cargar la
        // config. Y como `index.ts` la lanza con `stdio: 'ignore'`, el panic
        // no se veía en ningún log — solo un reintento cada 3 segundos, para
        // siempre.
        //
        // Se lee el nombre canónico primero y el viejo queda como respaldo,
        // para no romper a quien ya tenía `API_KEY`/`PORT` puestos.
        let api_key = env::var("SESSION_API_KEY")
            .or_else(|_| env::var("API_KEY"))
            .expect("SESSION_API_KEY es obligatorio en .env (el nombre viejo, API_KEY, sigue valiendo)");

        let weak = ["cambia_esto_por_una_clave_segura", "changeme", "secret", "password"];
        if weak.contains(&api_key.as_str()) || api_key.len() < 32 {
            panic!("SESSION_API_KEY insegura — debe tener al menos 32 caracteres. Genera una con: openssl rand -hex 32");
        }

        // El puerto, en último término, sale de `SESSION_API_URL`, que es lo
        // que el cliente llama de verdad. Antes había que declararlo dos veces
        // y nada comprobaba que coincidieran: con la URL en 18080 y sin `PORT`,
        // el servidor escuchaba en 3001 y el cliente hablaba al vacío.
        let port = env::var("SESSION_API_PORT")
            .or_else(|_| env::var("PORT"))
            .ok()
            .or_else(|| env::var("SESSION_API_URL").ok().and_then(|u| puerto_de_url(&u).map(|p| p.to_string())))
            .unwrap_or_else(|| "3001".into())
            .parse::<u16>()
            .expect("SESSION_API_PORT debe ser un número válido");

        let sessions_dir = env::var("SESSIONS_DIR")
            .unwrap_or_else(|_| "./sessions".into());

        // Directorio de auth de Baileys — donde están session-*.json, sender-key-*.json, etc.
        let auth_dir = env::var("AUTH_DIR")
            .unwrap_or_else(|_| "../auth".into());

        // Ruta del archivo SQLite para tracking de delivery de mensajes
        let db_path = env::var("DB_PATH")
            .unwrap_or_else(|_| "./data/messages.db".into());

        // Ruta del archivo SQLite para conversaciones de IA
        let conv_db_path = env::var("CONV_DB_PATH")
            .unwrap_or_else(|_| "./data/ai_conversations.db".into());

        // Webhook opcional (Discord-compatible) para alertas de watchdog muerto/recuperado
        let alert_webhook_url = env::var("ALERT_WEBHOOK_URL").ok().filter(|s| !s.is_empty());

        Config { port, api_key, sessions_dir, auth_dir, db_path, conv_db_path, alert_webhook_url }
    }
}

#[cfg(test)]
mod tests {
    use super::puerto_de_url;

    #[test]
    fn saca_el_puerto_de_una_url_normal() {
        assert_eq!(puerto_de_url("http://127.0.0.1:18080"), Some(18080));
        assert_eq!(puerto_de_url("https://host.interno:9000"), Some(9000));
    }

    #[test]
    fn ignora_la_ruta_que_venga_detras() {
        // Sin cortar en la primera '/', "18080/health" no parsea y el servidor
        // se iría al 3001 por defecto — justo el bug que esto arregla.
        assert_eq!(puerto_de_url("http://127.0.0.1:18080/health/live"), Some(18080));
        assert_eq!(puerto_de_url("http://127.0.0.1:18080/"), Some(18080));
    }

    #[test]
    fn sin_puerto_explicito_no_adivina() {
        // Mejor caer al valor por defecto que inventarse el 80 o el 443.
        assert_eq!(puerto_de_url("http://127.0.0.1"), None);
        assert_eq!(puerto_de_url("http://localhost/health"), None);
        assert_eq!(puerto_de_url(""), None);
    }

    #[test]
    fn un_puerto_que_no_es_numero_no_revienta() {
        assert_eq!(puerto_de_url("http://host:abc"), None);
        assert_eq!(puerto_de_url("http://host:99999"), None); // no cabe en u16
    }
}
