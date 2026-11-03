//! Lo que la Session API guarda de la gente, sin sus números.
//!
//! La base de la IA (`ai_conversations.db`) guardaba a cada persona con su
//! JID —su número, o su LID— junto a todo lo que escribió. Ahora la guarda
//! con un **seudónimo**: `u:` y 16 hexadecimales, el SipHash-2-4 de su JID
//! con una clave de 128 bits. Con la clave, el mismo JID da siempre el mismo
//! seudónimo —el estilo de cada uno se sigue aprendiendo—; sin ella, el
//! archivo no dice de quién es nada. Y los textos se guardan con los números
//! tapados (`phone::tapar_todos`).
//!
//! SipHash está en Ada/SPARK (`ada/src/sip_hash.ads`), demostrado sin errores
//! de ejecución; sin la feature `ada` decide `std::hash::SipHasher`, que es
//! SipHash-2-4, y contra la que se compara el de Ada en los tests.
//!
//! La clave vive en `privacy.key`, al lado de la base, y se crea la primera
//! vez. `WINSI_PRIVACY_KEY` (32 hexadecimales) la reemplaza. Si se pierde, la
//! IA empieza de cero a aprender el estilo de cada uno: nada se rompe.

use std::path::Path;
use std::sync::OnceLock;

static CLAVE: OnceLock<(u64, u64)> = OnceLock::new();

const MAX_MENSAJE: usize = 256;

#[cfg(winsi_ada)]
extern "C" {
    fn winsi_siphash24(k0: u64, k1: u64, mensaje: *const u8, largo: i32) -> u64;
}

/// SipHash-2-4 de `m` con la clave `(k0, k1)`.
pub fn siphash(k0: u64, k1: u64, m: &[u8]) -> u64 {
    if m.len() > MAX_MENSAJE {
        return siphash_rust(k0, k1, m);
    }
    siphash_ffi(k0, k1, m)
}

#[cfg(winsi_ada)]
fn siphash_ffi(k0: u64, k1: u64, m: &[u8]) -> u64 {
    let mut buf = [0u8; MAX_MENSAJE];
    buf[..m.len()].copy_from_slice(m);
    // SAFETY: un arreglo de MAX_MENSAJE bytes; GNATprove demuestra que
    // Sip_2_4_C solo lee las posiciones 1 .. largo.
    unsafe { winsi_siphash24(k0, k1, buf.as_ptr(), m.len() as i32) }
}

#[cfg(not(winsi_ada))]
fn siphash_ffi(k0: u64, k1: u64, m: &[u8]) -> u64 {
    siphash_rust(k0, k1, m)
}

/// La implementación de referencia: la de la biblioteca estándar, que es
/// SipHash-2-4. Está deprecada solo porque no promete ser la de `HashMap`.
#[allow(deprecated)]
pub fn siphash_rust(k0: u64, k1: u64, m: &[u8]) -> u64 {
    use std::hash::Hasher;
    let mut h = std::hash::SipHasher::new_with_keys(k0, k1);
    h.write(m);
    h.finish()
}

fn de_hex(s: &str) -> Option<(u64, u64)> {
    let s = s.trim();
    if s.len() != 32 || !s.bytes().all(|b| b.is_ascii_hexdigit()) {
        return None;
    }
    Some((
        u64::from_str_radix(&s[..16], 16).ok()?,
        u64::from_str_radix(&s[16..], 16).ok()?,
    ))
}

/// 128 bits al azar del generador del sistema operativo. Sale de dos UUID v4
/// —que ya usa el crate, y que piden los bytes al SO— en vez de sumar un
/// crate más: cada mitad mezcla dos UUID para que los bits fijos de versión y
/// variante no queden en la clave.
fn aleatoria() -> (u64, u64) {
    let a = uuid::Uuid::new_v4().as_u64_pair();
    let b = uuid::Uuid::new_v4().as_u64_pair();
    (a.0 ^ b.1, a.1 ^ b.0)
}

/// Carga la clave —de `WINSI_PRIVACY_KEY`, o de `dir/privacy.key`— o la crea.
/// Se llama una vez al abrir la base; lo que se llame después usa esta.
pub fn iniciar(dir: &Path) -> (u64, u64) {
    *CLAVE.get_or_init(|| {
        if let Some(k) = std::env::var("WINSI_PRIVACY_KEY")
            .ok()
            .as_deref()
            .and_then(de_hex)
        {
            return k;
        }
        let ruta = dir.join("privacy.key");
        if let Some(k) = std::fs::read_to_string(&ruta)
            .ok()
            .as_deref()
            .and_then(de_hex)
        {
            return k;
        }
        let k = aleatoria();
        if let Err(e) = guardar(&ruta, k) {
            tracing::warn!(
                "privacidad: no se pudo guardar {}: {e} — la clave dura hasta reiniciar",
                ruta.display()
            );
        } else {
            tracing::info!("privacidad: clave nueva en {}", ruta.display());
        }
        k
    })
}

fn guardar(ruta: &Path, (k0, k1): (u64, u64)) -> std::io::Result<()> {
    use std::io::Write;
    let mut o = std::fs::OpenOptions::new();
    o.write(true).create_new(true);
    // Solo el dueño del proceso la puede leer.
    #[cfg(unix)]
    std::os::unix::fs::OpenOptionsExt::mode(&mut o, 0o600);
    o.open(ruta)?
        .write_all(format!("{k0:016x}{k1:016x}\n").as_bytes())
}

fn clave() -> (u64, u64) {
    *CLAVE.get_or_init(|| {
        // Sin `iniciar` —los tests, que usan una base en memoria—: una fija en
        // los tests, y en otro caso una al azar que dura lo que el proceso.
        if cfg!(test) {
            (0x0706_0504_0302_0100, 0x0f0e_0d0c_0b0a_0908)
        } else {
            tracing::warn!("privacidad: clave sin iniciar — una al azar, hasta reiniciar");
            aleatoria()
        }
    })
}

/// Si ya es un seudónimo.
pub fn es_seudonimo(s: &str) -> bool {
    s.len() == 18 && s.starts_with("u:") && s[2..].bytes().all(|b| b.is_ascii_hexdigit())
}

/// El seudónimo de un JID: `u:` y 16 hexadecimales. El dispositivo no cuenta
/// (`51924360740:12@s.whatsapp.net` es la misma persona), y uno que ya es un
/// seudónimo queda igual, así que se puede aplicar dos veces sin cuidado.
pub fn seudonimo(jid: &str) -> String {
    if jid.is_empty() || es_seudonimo(jid) {
        return jid.to_string();
    }
    let normal = match crate::phone::leer_jid(jid) {
        Some((_, numero)) => {
            let servidor = jid.rsplit_once('@').map_or("", |(_, s)| s);
            format!("{numero}@{servidor}")
        }
        None => jid.to_string(),
    };
    let (k0, k1) = clave();
    format!("u:{:016x}", siphash(k0, k1, normal.as_bytes()))
}

/// Un JID para el log: `51924360740@s.whatsapp.net` →
/// `51••••••740@s.whatsapp.net`, con `Phone_Guard`. Los grupos quedan
/// enteros; `LOG_NUMEROS=completo` muestra todo, para depurar. Lo mismo que
/// `jidParaLog` del lado del bot (src/lib/phoneGuard.ts).
pub fn jid_para_log(jid: &str) -> String {
    static COMPLETO: OnceLock<bool> = OnceLock::new();
    if *COMPLETO.get_or_init(|| std::env::var("LOG_NUMEROS").as_deref() == Ok("completo")) {
        return jid.to_string();
    }
    match crate::phone::leer_jid(jid) {
        Some((crate::phone::TipoJid::Numero | crate::phone::TipoJid::Lid, numero)) => {
            let tapado =
                crate::phone::enmascarar(numero.as_bytes()).unwrap_or_else(|| numero.to_string());
            format!("{tapado}{}", &jid[numero.len()..])
        }
        _ => jid.to_string(),
    }
}

/// Los JID de personas dentro de un texto cualquiera —un JSON de auditoría—,
/// con el número tapado: `{"jid":"51924360740@s.whatsapp.net","ts":1793}` →
/// `{"jid":"51••••••740@s.whatsapp.net","ts":1793}`. Solo lo que va pegado a
/// `@s.whatsapp.net`, `@c.us` o `@lid` (con dispositivo o sin él): una hora,
/// un monto o un grupo quedan como están. Para lo que se GUARDA, así que no
/// mira `LOG_NUMEROS`.
pub fn tapar_jids(texto: &str) -> std::borrow::Cow<'_, str> {
    const SERVIDORES: [&[u8]; 3] = [b"@s.whatsapp.net", b"@c.us", b"@lid"];
    let t = texto.as_bytes();
    let es_de_persona = |fin: usize| {
        // Lo que sigue al número: el servidor, o ":<dispositivo>" y el servidor.
        let mut resto = &t[fin..];
        if let Some(r) = resto.strip_prefix(b":") {
            let d = r.iter().take_while(|b| b.is_ascii_digit()).count();
            resto = &r[d..];
        }
        SERVIDORES.iter().any(|s| resto.starts_with(s))
    };
    let mut out = String::new();
    let (mut desde, mut copiado) = (1, 0);
    while let Some((ini, fin, _)) = crate::phone::buscar_uno(t, desde) {
        let digitos = &t[ini - 1..fin];
        if digitos.iter().all(u8::is_ascii_digit) && es_de_persona(fin) {
            if let Some(tapado) = crate::phone::enmascarar(digitos) {
                out.push_str(&texto[copiado..ini - 1]);
                out.push_str(&tapado);
                copiado = fin;
            }
        }
        desde = fin + 1;
    }
    if copiado == 0 {
        return std::borrow::Cow::Borrowed(texto);
    }
    out.push_str(&texto[copiado..]);
    std::borrow::Cow::Owned(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tapar_jids_solo_toca_personas() {
        assert_eq!(
            tapar_jids(
                r#"{"jid":"51924360740:3@s.whatsapp.net","ts":1793728344,"g":"120363363621316758@g.us","lid":"31908117356669@lid"}"#
            ),
            r#"{"jid":"51••••••740:3@s.whatsapp.net","ts":1793728344,"g":"120363363621316758@g.us","lid":"31•••••••••669@lid"}"#
        );
        assert!(matches!(
            tapar_jids("nada 1234567890"),
            std::borrow::Cow::Borrowed(_)
        ));
    }

    #[test]
    fn el_log_tapa_personas_y_no_grupos() {
        assert_eq!(
            jid_para_log("51924360740:3@s.whatsapp.net"),
            "51••••••740:3@s.whatsapp.net"
        );
        assert_eq!(jid_para_log("31908117356669@lid"), "31•••••••••669@lid");
        assert_eq!(
            jid_para_log("120363363621316758@g.us"),
            "120363363621316758@g.us"
        );
        assert_eq!(jid_para_log("*global*"), "*global*");
    }

    /// El vector oficial: clave 00..0f, mensaje vacío (Aumasson y Bernstein,
    /// "SipHash: a fast short-input PRF", apéndice A).
    #[test]
    fn el_vector_del_paper() {
        let (k0, k1) = (0x0706_0504_0302_0100, 0x0f0e_0d0c_0b0a_0908);
        assert_eq!(siphash(k0, k1, b""), 0x726f_db47_dd0e_0e31);
        // Y el del texto del paper: 15 bytes 00..0e.
        let m: Vec<u8> = (0..15).collect();
        assert_eq!(siphash(k0, k1, &m), 0xa129_ca61_49be_45e5);
    }

    #[test]
    fn ada_y_la_referencia_dan_lo_mismo() {
        let mut s = 0x9E37_79B9_7F4A_7C15u64;
        let mut azar = || {
            s ^= s << 13;
            s ^= s >> 7;
            s ^= s << 17;
            s
        };
        for largo in 0..=MAX_MENSAJE + 4 {
            for _ in 0..40 {
                let (k0, k1) = (azar(), azar());
                let m: Vec<u8> = (0..largo).map(|_| azar() as u8).collect();
                assert_eq!(
                    siphash(k0, k1, &m),
                    siphash_rust(k0, k1, &m),
                    "largo {largo}"
                );
            }
        }
    }

    #[test]
    fn el_seudonimo_es_estable_y_no_dice_el_numero() {
        let a = seudonimo("51924360740@s.whatsapp.net");
        assert!(es_seudonimo(&a), "{a}");
        assert!(!a.contains("924360"));
        assert_eq!(
            seudonimo("51924360740:7@s.whatsapp.net"),
            a,
            "el dispositivo no cuenta"
        );
        assert_eq!(seudonimo(&a), a, "dos veces da lo mismo");
        assert_ne!(seudonimo("51924360741@s.whatsapp.net"), a);
        assert_ne!(seudonimo("51924360740@lid"), a);
        assert_eq!(seudonimo(""), "");
    }

    #[test]
    fn la_clave_se_lee_en_hexadecimal() {
        assert_eq!(
            de_hex(
                "0706050403020100 0f0e0d0c0b0a0908"
                    .replace(' ', "")
                    .as_str()
            ),
            Some((0x0706_0504_0302_0100, 0x0f0e_0d0c_0b0a_0908))
        );
        assert_eq!(de_hex("corta"), None);
        assert_eq!(de_hex(&"g".repeat(32)), None);
    }
}
