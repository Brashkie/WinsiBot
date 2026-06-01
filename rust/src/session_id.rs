use std::path::{Path, PathBuf};

#[derive(Debug)]
pub enum PathError {
    Traversal,
    InvalidChars,
}

impl std::fmt::Display for PathError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            PathError::Traversal    => write!(f, "session_id contiene path traversal (..)"),
            PathError::InvalidChars => write!(f, "session_id contiene caracteres inválidos (solo a-z, 0-9, -, _)"),
        }
    }
}

pub fn resolve(sessions_dir: &str, session_id: &str) -> Result<PathBuf, PathError> {
    if session_id.contains("..") || session_id.contains('/') || session_id.contains('\\') {
        return Err(PathError::Traversal);
    }
    if !session_id.chars().all(|c| c.is_alphanumeric() || c == '-' || c == '_') {
        return Err(PathError::InvalidChars);
    }
    if session_id.is_empty() || session_id.len() > 64 {
        return Err(PathError::InvalidChars);
    }
    Ok(Path::new(sessions_dir).join(session_id).join("creds.json"))
}

pub fn list_sessions(sessions_dir: &str) -> Vec<String> {
    let Ok(entries) = std::fs::read_dir(sessions_dir) else { return vec![]; };
    entries
        .flatten()
        .filter(|e| e.path().is_dir())
        .filter(|e| e.path().join("creds.json").exists())
        .filter_map(|e| e.file_name().into_string().ok())
        .collect()
}
