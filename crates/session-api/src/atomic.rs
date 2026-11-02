use crate::config::MAX_SESSION_BYTES;
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::Path;

/// Escribe sin dejar nunca el archivo a medias: a un `.tmp`, fsync, y rename.
///
/// Son archivos de sesión: quien los copie entra a WhatsApp como el bot. En
/// Unix (Linux, Termux) el archivo nace en 600 y su carpeta queda en 700, así
/// que ningún otro usuario de la máquina los lee. En Windows no aplica.
pub fn atomic_write(path: &Path, data: &[u8]) -> std::io::Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let _ = fs::set_permissions(parent, fs::Permissions::from_mode(0o700));
        }
    }
    let tmp = path.with_extension("tmp");
    {
        let mut opciones = OpenOptions::new();
        opciones.write(true).create(true).truncate(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            opciones.mode(0o600);
        }
        let mut f = opciones.open(&tmp)?;
        f.write_all(data)?;
        f.sync_all()?; // fsync — datos en disco antes del rename
    }
    fs::rename(&tmp, path)?; // rename atómico
    Ok(())
}

pub fn is_healthy(path: &Path) -> bool {
    let meta = match fs::metadata(path) {
        Ok(m) => m,
        Err(_) => return false,
    };
    if meta.len() > MAX_SESSION_BYTES as u64 {
        tracing::warn!(path = %path.display(), size = meta.len(), "archivo demasiado grande para validar");
        return false;
    }
    fs::read(path)
        .ok()
        .and_then(|b| serde_json::from_slice::<serde_json::Value>(&b).ok())
        .is_some()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn escribe_entero_y_reemplaza() {
        let dir = std::env::temp_dir().join(format!("winsi-atomic-{}", std::process::id()));
        let p = dir.join("sub").join("creds.json");
        atomic_write(&p, b"{\"a\":1}").unwrap();
        atomic_write(&p, b"{\"a\":2}").unwrap();
        assert_eq!(fs::read(&p).unwrap(), b"{\"a\":2}");
        assert!(!p.with_extension("tmp").exists());
        let _ = fs::remove_dir_all(&dir);
    }

    #[cfg(unix)]
    #[test]
    fn solo_lo_lee_quien_corre_el_bot() {
        use std::os::unix::fs::PermissionsExt;
        let dir = std::env::temp_dir().join(format!("winsi-perm-{}", std::process::id()));
        let p = dir.join("sesion").join("creds.json");
        atomic_write(&p, b"{}").unwrap();
        let modo = |q: &Path| fs::metadata(q).unwrap().permissions().mode() & 0o777;
        assert_eq!(modo(&p), 0o600);
        assert_eq!(modo(p.parent().unwrap()), 0o700);
        let _ = fs::remove_dir_all(&dir);
    }
}
