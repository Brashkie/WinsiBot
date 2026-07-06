use std::env;

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

        let port = env::var("PORT")
            .unwrap_or_else(|_| "3001".into())
            .parse::<u16>()
            .expect("PORT debe ser un número válido");

        let api_key = env::var("API_KEY")
            .expect("API_KEY es obligatorio en .env");

        let weak = ["cambia_esto_por_una_clave_segura", "changeme", "secret", "password"];
        if weak.contains(&api_key.as_str()) || api_key.len() < 32 {
            panic!("API_KEY insegura — debe tener al menos 32 caracteres. Genera una con: openssl rand -hex 32");
        }

        let sessions_dir = env::var("SESSIONS_DIR")
            .unwrap_or_else(|_| "./sessions".into());

        // Directorio de auth de Baileys — donde están session-*.json, sender-key-*.json, etc.
        let auth_dir = env::var("AUTH_DIR")
            .unwrap_or_else(|_| "../auth".into());

        // Ruta del archivo SQLite para tracking de delivery de mensajes
        let db_path = env::var("DB_PATH")
            .unwrap_or_else(|_| "./data/messages.db".into());

        // Ruta del archivo DuckDB para conversaciones de IA
        let conv_db_path = env::var("CONV_DB_PATH")
            .unwrap_or_else(|_| "./data/ai_conversations.duckdb".into());

        // Webhook opcional (Discord-compatible) para alertas de watchdog muerto/recuperado
        let alert_webhook_url = env::var("ALERT_WEBHOOK_URL").ok().filter(|s| !s.is_empty());

        Config { port, api_key, sessions_dir, auth_dir, db_path, conv_db_path, alert_webhook_url }
    }
}
