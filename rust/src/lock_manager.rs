/// lock_manager.rs
///
/// Un AsyncMutex por sessionId.
/// Garantiza que dos save() simultáneos para el mismo bot
/// se ejecuten en orden, nunca en paralelo.
///
/// Ejemplo:
///   bot1 llama save() dos veces al mismo tiempo →
///   segunda espera hasta que la primera termina → sin race condition.
///
/// DashMap en vez de Mutex<HashMap>: con muchos sub-bots/sesiones guardando
/// en paralelo (varios grupos activos a la vez), buscar el lock de CADA
/// sessionId pasaba antes por un único Mutex global — dos sesiones
/// completamente independientes se bloqueaban entre sí solo por competir por
/// ESE lock, no por ningún dato compartido real. Con DashMap, cada shard
/// tiene su propio lock interno, así que sesiones distintas casi nunca
/// contienden entre sí.

use dashmap::DashMap;
use std::sync::Arc;
use tokio::sync::Mutex as AsyncMutex;

#[derive(Clone, Default)]
pub struct LockManager {
    locks: Arc<DashMap<String, Arc<AsyncMutex<()>>>>,
}

impl LockManager {
    pub fn new() -> Self {
        Self::default()
    }

    /// Retorna el lock para ese sessionId, creándolo si no existe.
    /// Cuando el mapa supera 512 entradas, elimina los locks sin uso
    /// (Arc con strong_count == 1 significa que solo el mapa lo retiene).
    pub fn get(&self, session_id: &str) -> Arc<AsyncMutex<()>> {
        if self.locks.len() >= 512 && !self.locks.contains_key(session_id) {
            let before = self.locks.len();
            self.locks.retain(|_, v| Arc::strong_count(v) > 1);
            tracing::debug!(before, after = self.locks.len(), "LockManager: evicted unused locks");
        }
        self.locks
            .entry(session_id.to_string())
            .or_insert_with(|| Arc::new(AsyncMutex::new(())))
            .clone()
    }

    /// Cuántas sesiones tienen un lock vivo en memoria.
    pub fn active_count(&self) -> usize {
        self.locks.len()
    }
}
