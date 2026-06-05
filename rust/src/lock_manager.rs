/// lock_manager.rs
///
/// Un AsyncMutex por sessionId.
/// Garantiza que dos save() simultáneos para el mismo bot
/// se ejecuten en orden, nunca en paralelo.
///
/// Ejemplo:
///   bot1 llama save() dos veces al mismo tiempo →
///   segunda espera hasta que la primera termina → sin race condition.

use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tokio::sync::Mutex as AsyncMutex;

#[derive(Clone, Default)]
pub struct LockManager {
    locks: Arc<Mutex<HashMap<String, Arc<AsyncMutex<()>>>>>,
}

impl LockManager {
    pub fn new() -> Self {
        Self::default()
    }

    /// Retorna el lock para ese sessionId, creándolo si no existe.
    /// Cuando el mapa supera 512 entradas, elimina los locks sin uso
    /// (Arc con strong_count == 1 significa que solo el mapa lo retiene).
    pub fn get(&self, session_id: &str) -> Arc<AsyncMutex<()>> {
        let mut map = self.locks.lock().unwrap();
        if map.len() >= 512 && !map.contains_key(session_id) {
            let before = map.len();
            map.retain(|_, v| Arc::strong_count(v) > 1);
            tracing::debug!(before, after = map.len(), "LockManager: evicted unused locks");
        }
        map.entry(session_id.to_string())
            .or_insert_with(|| Arc::new(AsyncMutex::new(())))
            .clone()
    }

    /// Cuántas sesiones tienen un lock vivo en memoria.
    pub fn active_count(&self) -> usize {
        self.locks.lock().unwrap().len()
    }
}
