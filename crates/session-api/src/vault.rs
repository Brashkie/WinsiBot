//! La bóveda: las claves con las que se sella la sesión de WhatsApp.
//!
//! Son dos claves de 32 bytes, al azar del sistema operativo:
//!
//! - la de **`auth/`**, que la Session API le entrega al bot al arrancar
//!   (`GET /vault/auth`, con la API key y solo en 127.0.0.1). Con ella el bot
//!   sella cada archivo de la sesión (`src/lib/authSeal.ts`);
//! - la de los **respaldos**, que no sale de acá: sella las copias de
//!   `creds.json` y sus snapshots en `sessions/` ([`crate::seal`]).
//!
//! Viven en `vault.key`, al lado de la base. En **Windows** el archivo guarda
//! las claves protegidas con **DPAPI** (`CryptProtectData`): solo las abre el
//! mismo usuario de Windows en la misma máquina, así que copiar `vault.key`
//! junto con `auth/` a otra parte no alcanza para abrir nada. En Linux, macOS y
//! Termux no hay un equivalente sin dependencias, y el archivo queda en 600:
//! ahí protege contra quien copie `auth/` o sus respaldos, que es lo común
//! —un respaldo, una carpeta compartida—, pero no contra quien se lleve la
//! carpeta de datos entera. `WINSI_VAULT_KEY` (128 hexadecimales: las dos
//! claves) reemplaza al archivo, para quien prefiera guardarlas en otro lado.
//!
//! **Si `vault.key` se pierde, hay que escanear el QR otra vez**: la sesión
//! sellada no se puede abrir. Por eso, si el archivo existe pero no se puede
//! abrir —otro usuario de Windows, un archivo dañado— no se crea uno nuevo
//! encima: se avisa y el bot no arranca la sesión, en vez de perderla sin decir
//! nada.

use std::path::Path;
use std::sync::OnceLock;

/// Las dos claves.
#[derive(Clone)]
pub struct Claves {
    pub auth: [u8; 32],
    pub respaldo: [u8; 32],
}

static CLAVES: OnceLock<Result<Claves, String>> = OnceLock::new();

/// La marca de `vault.key`, y cómo están guardadas las claves.
const MARCA: &[u8; 4] = b"WVK1";
const PLANA: u8 = 0;
const DPAPI: u8 = 1;

/// Carga las claves —de `WINSI_VAULT_KEY`, o de `dir/vault.key`— o las crea.
/// Se llama una vez al arrancar.
pub fn iniciar(dir: &Path) -> Result<(), String> {
    CLAVES
        .get_or_init(|| cargar_o_crear(dir))
        .as_ref()
        .map(|_| ())
        .map_err(Clone::clone)
}

/// Las claves, si la bóveda se pudo abrir.
pub fn claves() -> Result<Claves, String> {
    match CLAVES.get() {
        Some(r) => r.clone(),
        None => Err("la bóveda no se inició".into()),
    }
}

fn de_hex(s: &str) -> Option<[u8; 64]> {
    let s = s.trim();
    if s.len() != 128 {
        return None;
    }
    let mut out = [0u8; 64];
    for (i, o) in out.iter_mut().enumerate() {
        *o = u8::from_str_radix(s.get(2 * i..2 * i + 2)?, 16).ok()?;
    }
    Some(out)
}

fn partir(b: &[u8; 64]) -> Claves {
    Claves {
        auth: b[..32].try_into().expect("32 bytes"),
        respaldo: b[32..].try_into().expect("32 bytes"),
    }
}

fn cargar_o_crear(dir: &Path) -> Result<Claves, String> {
    if let Ok(v) = std::env::var("WINSI_VAULT_KEY") {
        return de_hex(&v)
            .map(|b| partir(&b))
            .ok_or_else(|| "WINSI_VAULT_KEY tiene que ser 128 hexadecimales".into());
    }
    let ruta = dir.join("vault.key");
    match std::fs::read(&ruta) {
        Ok(b) => leer(&b).map(|k| partir(&k)).map_err(|e| {
            format!(
                "{} existe pero no se puede abrir ({e}). No se crea otro encima: la sesión \
                 sellada solo se abre con esa clave",
                ruta.display()
            )
        }),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            let mut k = [0u8; 64];
            getrandom::fill(&mut k).map_err(|e| format!("el sistema no dio bytes al azar: {e}"))?;
            std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
            guardar(&ruta, &k)?;
            tracing::info!("bóveda: claves nuevas en {}", ruta.display());
            Ok(partir(&k))
        }
        Err(e) => Err(format!("no se pudo leer {}: {e}", ruta.display())),
    }
}

/// Lo que guarda `vault.key`: la marca, cómo, y las claves.
fn leer(b: &[u8]) -> Result<[u8; 64], String> {
    if b.len() < 5 || &b[..4] != MARCA {
        return Err("no es un vault.key".into());
    }
    let cuerpo = &b[5..];
    let claves = match b[4] {
        PLANA => cuerpo.to_vec(),
        DPAPI => dpapi::abrir(cuerpo)?,
        otro => return Err(format!("forma de guardado desconocida {otro}")),
    };
    claves
        .try_into()
        .map_err(|v: Vec<u8>| format!("{} bytes de claves, se esperaban 64", v.len()))
}

fn guardar(ruta: &Path, k: &[u8; 64]) -> Result<(), String> {
    use std::io::Write;
    let mut contenido = MARCA.to_vec();
    match dpapi::proteger(k) {
        Some(blob) => {
            contenido.push(DPAPI);
            contenido.extend_from_slice(&blob);
        }
        None => {
            contenido.push(PLANA);
            contenido.extend_from_slice(k);
        }
    }
    let mut o = std::fs::OpenOptions::new();
    o.write(true).create_new(true);
    // Solo el dueño del proceso la puede leer.
    #[cfg(unix)]
    std::os::unix::fs::OpenOptionsExt::mode(&mut o, 0o600);
    let mut f = o
        .open(ruta)
        .map_err(|e| format!("no se pudo crear {}: {e}", ruta.display()))?;
    f.write_all(&contenido)
        .and_then(|_| f.sync_all())
        .map_err(|e| format!("no se pudo escribir {}: {e}", ruta.display()))
}

/// DPAPI de Windows, sin crates: dos funciones de `crypt32` y `LocalFree`.
#[cfg(windows)]
mod dpapi {
    use std::ffi::c_void;

    #[repr(C)]
    struct Blob {
        largo: u32,
        datos: *mut u8,
    }

    const SIN_INTERFAZ: u32 = 0x1; // CRYPTPROTECT_UI_FORBIDDEN

    #[link(name = "crypt32")]
    extern "system" {
        fn CryptProtectData(
            entrada: *const Blob,
            descripcion: *const u16,
            entropia: *const Blob,
            reservado: *mut c_void,
            aviso: *mut c_void,
            banderas: u32,
            salida: *mut Blob,
        ) -> i32;
        fn CryptUnprotectData(
            entrada: *const Blob,
            descripcion: *mut *mut u16,
            entropia: *const Blob,
            reservado: *mut c_void,
            aviso: *mut c_void,
            banderas: u32,
            salida: *mut Blob,
        ) -> i32;
    }

    #[link(name = "kernel32")]
    extern "system" {
        fn LocalFree(h: *mut c_void) -> *mut c_void;
    }

    /// Una entropía propia: otro programa del mismo usuario que llame a DPAPI
    /// sin ella no abre el blob.
    const ENTROPIA: &[u8] = b"WinsiBot vault v1";

    fn blob(b: &[u8]) -> Blob {
        Blob {
            largo: b.len() as u32,
            datos: b.as_ptr() as *mut u8,
        }
    }

    /// Copia lo que devolvió DPAPI y lo libera.
    ///
    /// SAFETY: `b` lo llenó DPAPI con un puntero de `LocalAlloc` y su largo.
    unsafe fn tomar(b: Blob) -> Vec<u8> {
        let v = std::slice::from_raw_parts(b.datos, b.largo as usize).to_vec();
        // Lo que se libera son las claves en claro (al abrir): se borra antes.
        std::ptr::write_bytes(b.datos, 0, b.largo as usize);
        LocalFree(b.datos as *mut c_void);
        v
    }

    pub fn proteger(k: &[u8]) -> Option<Vec<u8>> {
        let entrada = blob(k);
        let entropia = blob(ENTROPIA);
        let mut salida = Blob {
            largo: 0,
            datos: std::ptr::null_mut(),
        };
        // SAFETY: los blobs de entrada apuntan a memoria viva durante la
        // llamada, y la de salida la reserva DPAPI y la libera `tomar`.
        unsafe {
            if CryptProtectData(
                &entrada,
                std::ptr::null(),
                &entropia,
                std::ptr::null_mut(),
                std::ptr::null_mut(),
                SIN_INTERFAZ,
                &mut salida,
            ) == 0
            {
                tracing::warn!("bóveda: DPAPI no protegió las claves; quedan en un archivo común");
                return None;
            }
            Some(tomar(salida))
        }
    }

    pub fn abrir(protegido: &[u8]) -> Result<Vec<u8>, String> {
        let entrada = blob(protegido);
        let entropia = blob(ENTROPIA);
        let mut salida = Blob {
            largo: 0,
            datos: std::ptr::null_mut(),
        };
        // SAFETY: como en `proteger`.
        unsafe {
            if CryptUnprotectData(
                &entrada,
                std::ptr::null_mut(),
                &entropia,
                std::ptr::null_mut(),
                std::ptr::null_mut(),
                SIN_INTERFAZ,
                &mut salida,
            ) == 0
            {
                return Err("DPAPI no las abrió: ¿otro usuario de Windows u otra máquina?".into());
            }
            Ok(tomar(salida))
        }
    }
}

#[cfg(not(windows))]
mod dpapi {
    pub fn proteger(_: &[u8]) -> Option<Vec<u8>> {
        None
    }

    pub fn abrir(_: &[u8]) -> Result<Vec<u8>, String> {
        Err("guardadas con DPAPI, que solo existe en Windows".into())
    }
}

/// Los datos asociados de un respaldo de la sesión `id`: el nombre de la
/// sesión, así un respaldo no se abre en el lugar de otro.
pub fn aad_respaldo(id: &str) -> Vec<u8> {
    format!("winsibot:respaldo:{id}").into_bytes()
}

/// El id de sesión de la ruta de un respaldo (`sessions/<id>/creds.json` o un
/// snapshot en `sessions/<id>/.snapshots/`).
pub fn id_de(ruta: &Path) -> String {
    let carpeta = ruta.parent();
    let carpeta = match carpeta.and_then(|c| c.file_name()) {
        Some(n) if n == ".snapshots" => carpeta.and_then(|c| c.parent()),
        _ => carpeta,
    };
    carpeta
        .and_then(|c| c.file_name())
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_default()
}

/// Sella un respaldo para guardarlo.
pub fn sellar_respaldo(ruta: &Path, datos: &[u8]) -> Result<Vec<u8>, String> {
    let k = claves()?;
    crate::seal::sellar(&k.respaldo, &aad_respaldo(&id_de(ruta)), datos).map_err(|e| e.to_string())
}

/// Lo que hay en un respaldo, en claro: lo abre si está sellado y lo devuelve
/// tal cual si no (los de antes de la 9.5, hasta que se migren).
pub fn abrir_respaldo(ruta: &Path, datos: Vec<u8>) -> Result<Vec<u8>, String> {
    if !crate::seal::esta_sellado(&datos) {
        return Ok(datos);
    }
    let k = claves()?;
    crate::seal::abrir(&k.respaldo, &aad_respaldo(&id_de(ruta)), &datos).map_err(|e| e.to_string())
}

/// Sella los respaldos que todavía están en claro: `creds.json` y sus
/// snapshots, de cada sesión. Una vez, al arrancar; después ya no queda nada.
/// Devuelve cuántos selló.
pub fn sellar_respaldos_viejos(sessions_dir: &Path) -> usize {
    let Ok(k) = claves() else { return 0 };
    let mut n = 0;
    let Ok(sesiones) = std::fs::read_dir(sessions_dir) else {
        return 0;
    };
    for s in sesiones.flatten() {
        let carpeta = s.path();
        let mut archivos = vec![carpeta.join("creds.json")];
        if let Ok(snaps) = std::fs::read_dir(carpeta.join(".snapshots")) {
            archivos.extend(snaps.flatten().map(|e| e.path()));
        }
        for ruta in archivos {
            let Ok(datos) = std::fs::read(&ruta) else {
                continue;
            };
            if crate::seal::esta_sellado(&datos) || datos.is_empty() {
                continue;
            }
            match crate::seal::sellar(&k.respaldo, &aad_respaldo(&id_de(&ruta)), &datos) {
                Ok(s) => match crate::atomic::atomic_write(&ruta, &s) {
                    Ok(()) => n += 1,
                    Err(e) => {
                        tracing::warn!(ruta = %ruta.display(), "bóveda: no se pudo sellar: {e}")
                    }
                },
                Err(e) => tracing::warn!(ruta = %ruta.display(), "bóveda: no se pudo sellar: {e}"),
            }
        }
    }
    n
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn el_id_sale_de_la_ruta() {
        let base = Path::new("data").join("sessions");
        assert_eq!(id_de(&base.join("main").join("creds.json")), "main");
        assert_eq!(
            id_de(&base.join("sub1").join(".snapshots").join("creds_001.snap")),
            "sub1"
        );
    }

    #[test]
    fn vault_key_ida_y_vuelta() {
        let dir = std::env::temp_dir().join(format!("winsi-vault-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let ruta = dir.join("vault.key");
        let k: [u8; 64] = std::array::from_fn(|i| i as u8);
        guardar(&ruta, &k).unwrap();
        let b = std::fs::read(&ruta).unwrap();
        assert_eq!(&b[..4], MARCA);
        // En Windows va protegido: los bytes de las claves no aparecen.
        if cfg!(windows) {
            assert_eq!(b[4], DPAPI);
            assert!(!b.windows(16).any(|w| w == &k[..16]));
        }
        assert_eq!(leer(&b).unwrap(), k);
        // No se pisa uno que ya existe.
        assert!(guardar(&ruta, &[9u8; 64]).is_err());
        // Uno dañado no se abre, y lo dice.
        let mut mal = b.clone();
        let ultimo = mal.len() - 1;
        mal[ultimo] ^= 1;
        if cfg!(windows) {
            assert!(leer(&mal).is_err());
        }
        assert!(leer(b"nada").is_err());
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn hex_de_128() {
        let s: String = (0..64).map(|i| format!("{i:02x}")).collect();
        let k = de_hex(&s).unwrap();
        assert_eq!(k[63], 63);
        assert!(de_hex(&s[..126]).is_none());
        assert!(de_hex(&format!("{}zz", &s[..126])).is_none());
    }
}
