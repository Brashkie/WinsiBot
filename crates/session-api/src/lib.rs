//! Biblioteca del Session API — mismo código que usa el binario.
//!
//! El crate se parte en lib + bin para que los benchmarks de Criterion (y
//! cualquier test de integración) puedan importar los módulos. Un crate que
//! es solo `[[bin]]` no se puede importar desde `benches/`.

pub mod ai_chat;
pub mod alerts;
pub mod amount;
pub mod analytics;
pub mod animation;
pub mod anime4k;
pub mod antiban;
pub mod arena;
pub mod atomic;
pub mod auth;
pub mod bad_mac;
pub mod config;
pub mod conversations;
pub mod db;
pub mod group_guard;
pub mod imagefx;
pub mod imagesearch;
pub mod ingest;
pub mod jpeg;
pub mod ledger;
pub mod lock_manager;
pub mod metrics;
pub mod nlp;
pub mod personality;
pub mod phone;
pub mod platform;
pub mod privacy;
pub mod rate_limiter;
pub mod render;
pub mod resize;
pub mod rng;
pub mod routes;
pub mod send_pacing;
pub mod session_id;
pub mod simd;
pub mod snapshot;
pub mod sticker;
pub mod subbots;
pub mod tasks;
pub mod user_memory;
pub mod vision;
pub mod watchdog;
