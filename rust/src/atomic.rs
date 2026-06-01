use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::Path;

pub fn atomic_write(path: &Path, data: &[u8]) -> std::io::Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let tmp = path.with_extension("tmp");
    {
        let mut f = OpenOptions::new()
            .write(true).create(true).truncate(true)
            .open(&tmp)?;
        f.write_all(data)?;
        f.sync_all()?; // fsync — datos en disco antes del rename
    }
    fs::rename(&tmp, path)?; // rename atómico
    Ok(())
}

pub fn is_healthy(path: &Path) -> bool {
    fs::read(path)
        .ok()
        .and_then(|b| serde_json::from_slice::<serde_json::Value>(&b).ok())
        .is_some()
}
