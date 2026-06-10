/// snapshot.rs v3
///
/// Rotación de snapshots:
///   creds_001.snap  ← más reciente
///   creds_002.snap
///   ...
///   creds_005.snap  ← más antiguo (se elimina al rotar)

use chrono::{DateTime, Utc};
use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use crate::atomic::atomic_write;

const MAX: usize = 10; // 10 versiones rotativas — suficiente para recuperar tras horas de corrupción

/// Crea un snapshot rotativo del archivo de sesión.
/// Rota: 004→005, 003→004, 002→003, 001→002, nuevo→001
pub fn create(path: &Path) -> std::io::Result<()> {
    if !path.exists() { return Ok(()); }

    let dir = snap_dir(path);
    fs::create_dir_all(&dir)?;

    // Eliminar el más antiguo si ya hay MAX
    if snap(path, MAX).exists() {
        fs::remove_file(snap(path, MAX))?;
    }

    // Rotar de atrás hacia adelante
    for i in (1..MAX).rev() {
        let from = snap(path, i);
        if from.exists() {
            fs::rename(&from, snap(path, i + 1))?;
        }
    }

    // Guardar estado actual como snapshot #1
    let data = fs::read(path)?;
    atomic_write(&snap(path, 1), &data)
}

/// Restaura desde el snapshot más reciente que sea JSON válido.
pub fn recover(path: &Path) -> Option<String> {
    for i in 1..=MAX {
        let s = snap(path, i);
        if let Ok(data) = fs::read(&s) {
            if serde_json::from_slice::<serde_json::Value>(&data).is_ok() {
                atomic_write(path, &data).ok()?;
                return Some(format!("snapshot #{i}"));
            }
        }
    }
    None
}

/// Lista todos los snapshots con estado (válido / corrupto).
/// Solo devuelve el número y estado — nunca rutas del sistema de archivos.
pub fn list(path: &Path) -> Vec<String> {
    (1..=MAX).filter_map(|i| {
        let s = snap(path, i);
        if !s.exists() { return None; }
        let meta = fs::metadata(&s).ok()?;
        if meta.len() > 10_000_000 {
            return Some(format!("#{i} [✗ demasiado grande]"));
        }
        let healthy = fs::read(&s)
            .ok()
            .and_then(|b| serde_json::from_slice::<serde_json::Value>(&b).ok())
            .is_some();
        Some(format!("#{i} [{}]", if healthy { "✓ válido" } else { "✗ corrupto" }))
    }).collect()
}

/// Metadatos del snapshot más reciente (snapshot #1).
/// Usado por el endpoint /healthy para observabilidad.
#[derive(Serialize)]
pub struct SnapMeta {
    pub index:      usize,
    pub name:       String,
    pub size_bytes: u64,
    pub ts:         DateTime<Utc>,
}

pub fn latest_meta(session_path: &Path) -> Option<SnapMeta> {
    let s    = snap(session_path, 1);
    let meta = fs::metadata(&s).ok()?;
    let name = s.file_name()?.to_string_lossy().to_string();
    Some(SnapMeta {
        index:      1,
        name,
        size_bytes: meta.len(),
        ts:         DateTime::<Utc>::from(meta.modified().ok()?),
    })
}

/// Lee el contenido del primer snapshot válido sin sobreescribir el archivo principal.
/// Útil para recuperar creds.json sin tocar sessions/main.json.
/// Devuelve (datos_crudos, índice_snapshot).
pub fn read_best_valid(path: &Path) -> Option<(Vec<u8>, usize)> {
    for i in 1..=MAX {
        let s = snap(path, i);
        if let Ok(data) = fs::read(&s) {
            if serde_json::from_slice::<serde_json::Value>(&data).is_ok() {
                return Some((data, i));
            }
        }
    }
    None
}

// ── helpers ───────────────────────────────────────────────────────────────────

fn snap_dir(p: &Path) -> PathBuf {
    p.parent().unwrap_or(Path::new(".")).join(".snapshots")
}

fn snap(p: &Path, i: usize) -> PathBuf {
    let stem = p.file_stem().unwrap_or_default().to_string_lossy();
    snap_dir(p).join(format!("{stem}_{i:03}.snap"))
}
