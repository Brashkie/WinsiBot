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

    /// Retorna el lock para ese sessionId.
    /// Si no existe aún, lo crea. El lock persiste en memoria
    /// mientras el servidor esté corriendo.
    pub fn get(&self, session_id: &str) -> Arc<AsyncMutex<()>> {
        let mut map = self.locks.lock().unwrap();
        map.entry(session_id.to_string())
            .or_insert_with(|| Arc::new(AsyncMutex::new(())))
            .clone()
    }

    /// Cuántas sesiones tienen un lock activo en memoria.
    pub fn active_count(&self) -> usize {
        self.locks.lock().unwrap().len()
    }
}
