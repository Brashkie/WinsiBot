//! Biblioteca del Session API — mismo código que usa el binario.
//!
//! El crate se parte en lib + bin para que los benchmarks de Criterion (y
//! cualquier test de integración) puedan importar los módulos. Un crate que
//! es solo `[[bin]]` no se puede importar desde `benches/`.

pub mod alerts;
pub mod analytics;
pub mod atomic;
pub mod auth;
pub mod bad_mac;
pub mod config;
pub mod conversations;
pub mod db;
pub mod lock_manager;
pub mod metrics;
pub mod nlp;
pub mod platform;
pub mod rate_limiter;
pub mod routes;
pub mod session_id;
pub mod snapshot;
pub mod subbots;
pub mod tasks;
pub mod watchdog;
