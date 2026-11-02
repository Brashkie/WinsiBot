//! El nombre de una sesión, que termina siendo una carpeta del disco.
//!
//! La regla está en Ada/SPARK (`ada/src/session_name.ads`) y GNATprove
//! demuestra que acepta EXACTAMENTE: de 1 a 64 bytes de `[A-Za-z0-9_-]`, que
//! no sean un nombre reservado de Windows (CON, PRN, AUX, NUL, COM0-9,
//! LPT0-9). Con la feature `ada` se enlaza ese objeto; sin ella —sin GNAT, o
//! en Android— decide la copia de abajo, comparada contra Ada en todas las
//! cadenas de hasta 3 bytes y en las de 4 que importan.
//!
//! Hasta la 9.3 se validaba con `is_alphanumeric()`, que acepta cualquier
//! letra Unicode, y no se miraban los nombres reservados: una sesión `con` o
//! `nul` en Windows no es una carpeta.

use std::path::{Path, PathBuf};

#[derive(Debug, PartialEq, Eq)]
pub enum PathError {
    Traversal,
    InvalidChars,
    Reserved,
}

impl std::fmt::Display for PathError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            PathError::Traversal => write!(f, "session_id contiene path traversal (.., / o \\)"),
            PathError::InvalidChars => write!(
                f,
                "session_id inválido: de 1 a 64 caracteres de a-z, A-Z, 0-9, - y _"
            ),
            PathError::Reserved => write!(f, "session_id es un nombre reservado de Windows"),
        }
    }
}

/// Como `Max_Largo` en Ada.
pub const MAX_LARGO: usize = 64;

/// Los códigos de `Session_Name.Validar_C`.
pub const VALIDO: i32 = 0;
pub const LARGO: i32 = 1;
pub const CARACTER: i32 = 2;
pub const RESERVADO: i32 = 3;

#[cfg(winsi_ada)]
extern "C" {
    fn winsi_session_name_check(texto: *const u8, largo: i32) -> i32;
}

/// El código de un nombre: Ada si se enlazó; si no, la copia.
pub fn validar(nombre: &[u8]) -> i32 {
    if nombre.is_empty() || nombre.len() > MAX_LARGO {
        return LARGO;
    }
    let mut buf = [0u8; MAX_LARGO];
    buf[..nombre.len()].copy_from_slice(nombre);
    validar_buf(&buf, nombre.len() as i32)
}

#[cfg(winsi_ada)]
fn validar_buf(t: &[u8; MAX_LARGO], largo: i32) -> i32 {
    // SAFETY: un arreglo de MAX_LARGO bytes; GNATprove demuestra que la
    // función solo lee las posiciones 1 .. largo, con largo en 1 .. 64.
    unsafe { winsi_session_name_check(t.as_ptr(), largo) }
}

#[cfg(not(winsi_ada))]
fn validar_buf(t: &[u8; MAX_LARGO], largo: i32) -> i32 {
    validar_rust(t, largo)
}

fn es_reservado(t: &[u8]) -> bool {
    let m = |i: usize| t[i].to_ascii_uppercase();
    match t.len() {
        3 => matches!(
            [m(0), m(1), m(2)],
            [b'C', b'O', b'N'] | [b'P', b'R', b'N'] | [b'A', b'U', b'X'] | [b'N', b'U', b'L']
        ),
        4 => {
            matches!([m(0), m(1), m(2)], [b'C', b'O', b'M'] | [b'L', b'P', b'T'])
                && t[3].is_ascii_digit()
        }
        _ => false,
    }
}

/// La misma regla que `Session_Name.Validar_C`.
pub fn validar_rust(t: &[u8; MAX_LARGO], largo: i32) -> i32 {
    if !(1..=MAX_LARGO as i32).contains(&largo) {
        return LARGO;
    }
    let t = &t[..largo as usize];
    if !t
        .iter()
        .all(|&b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
    {
        return CARACTER;
    }
    if es_reservado(t) {
        return RESERVADO;
    }
    VALIDO
}

pub fn resolve(sessions_dir: &str, session_id: &str) -> Result<PathBuf, PathError> {
    match validar(session_id.as_bytes()) {
        VALIDO => Ok(Path::new(sessions_dir).join(session_id).join("creds.json")),
        RESERVADO => Err(PathError::Reserved),
        _ if session_id.contains("..") || session_id.contains('/') || session_id.contains('\\') => {
            Err(PathError::Traversal)
        }
        _ => Err(PathError::InvalidChars),
    }
}

pub fn list_sessions(sessions_dir: &str) -> Vec<String> {
    let Ok(entries) = std::fs::read_dir(sessions_dir) else {
        return vec![];
    };
    entries
        .flatten()
        .filter(|e| e.path().is_dir())
        .filter(|e| e.path().join("creds.json").exists())
        .filter_map(|e| e.file_name().into_string().ok())
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn los_nombres_de_siempre_y_lo_que_no() {
        for ok in [
            "main",
            "51999888777",
            "sub_bot-1",
            "A",
            &"x".repeat(64),
            "console",
            "COM10",
            "nulo",
            "lpt",
        ] {
            assert!(resolve("s", ok).is_ok(), "{ok}");
        }
        for (malo, e) in [
            ("", PathError::InvalidChars),
            (&*"x".repeat(65), PathError::InvalidChars),
            ("../creds", PathError::Traversal),
            ("a/b", PathError::Traversal),
            ("a\\b", PathError::Traversal),
            ("a.b", PathError::InvalidChars),
            ("sesión", PathError::InvalidChars),
            ("１２３", PathError::InvalidChars),
            ("ses ion", PathError::InvalidChars),
            ("con", PathError::Reserved),
            ("NUL", PathError::Reserved),
            ("Com1", PathError::Reserved),
            ("lpt9", PathError::Reserved),
            ("aux", PathError::Reserved),
        ] {
            assert_eq!(resolve("s", malo).err(), Some(e), "{malo:?}");
        }
    }

    #[cfg(winsi_ada)]
    #[test]
    fn rust_y_ada_dan_lo_mismo() {
        // Todas las cadenas de hasta 3 bytes, con cualquier byte.
        let mut buf = [0u8; MAX_LARGO];
        for largo in 0..=3i32 {
            let total = 256u32.pow(largo as u32);
            for n in 0..total {
                for (i, b) in buf.iter_mut().take(largo as usize).enumerate() {
                    *b = (n >> (8 * i)) as u8;
                }
                assert_eq!(
                    validar_buf(&buf, largo),
                    validar_rust(&buf, largo),
                    "{:?}",
                    &buf[..largo as usize]
                );
            }
        }
        // Las de 4 que importan: letras de los reservados, dígitos y algo más.
        let alfabeto = b"cCoOmMlLpPtTnNuUrRaAxX019_-.z/\xff";
        for a in alfabeto {
            for b in alfabeto {
                for c in alfabeto {
                    for d in alfabeto {
                        buf[..4].copy_from_slice(&[*a, *b, *c, *d]);
                        assert_eq!(validar_buf(&buf, 4), validar_rust(&buf, 4));
                    }
                }
            }
        }
        // Largos fuera de rango, que llegan de C tal cual.
        for largo in [-5, -1, 0, 64, 65, 1000, i32::MIN, i32::MAX] {
            assert_eq!(
                validar_buf(&buf, largo),
                validar_rust(&buf, largo),
                "largo {largo}"
            );
        }
    }
}
