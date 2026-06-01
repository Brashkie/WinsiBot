use std::env;

#[derive(Clone, Debug)]
pub struct Config {
    pub port: u16,
    pub api_key: String,
    pub sessions_dir: String,
    pub auth_dir: String,
    pub db_path: String,
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

        if api_key == "cambia_esto_por_una_clave_segura" || api_key.len() < 16 {
            panic!("API_KEY insegura — genera una con: openssl rand -hex 32");
        }

        let sessions_dir = env::var("SESSIONS_DIR")
            .unwrap_or_else(|_| "./sessions".into());

        // Directorio de auth de Baileys — donde están session-*.json, sender-key-*.json, etc.
        let auth_dir = env::var("AUTH_DIR")
            .unwrap_or_else(|_| "../auth".into());

        // Ruta del archivo SQLite para tracking de delivery de mensajes
        let db_path = env::var("DB_PATH")
            .unwrap_or_else(|_| "./data/messages.db".into());

        Config { port, api_key, sessions_dir, auth_dir, db_path }
    }
}
