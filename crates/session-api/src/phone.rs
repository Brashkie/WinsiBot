//! Los números de WhatsApp de la gente: encontrarlos en un texto, taparlos y
//! leerlos de un JID.
//!
//! La regla está en Ada/SPARK (`ada/src/phone_guard.ads`) y GNATprove
//! demuestra lo que importa para no filtrar un número: que lo tapado deja ver
//! SOLO los dos primeros y los tres últimos dígitos, y que buscar y leer nunca
//! salen del texto. Con la feature `ada` se enlaza ese objeto; sin ella —sin
//! GNAT, o en Android— decide la copia de abajo, comparada contra Ada en
//! millones de textos. La copia en TypeScript (`src/lib/phoneGuard.ts`), la
//! que usa el bot si la Session API no contesta, se compara contra esta con
//! `scripts/phone_guard.vectors.json`.
//!
//! Qué es un número: de 6 a 20 dígitos seguidos, con hasta dos separadores
//! (espacio, guion, punto, paréntesis) entre ellos, que no estén pegados a una
//! letra o a otro dígito: "+51 924-360-740", "@51924360740". Un monto como
//! "10000000000 monedas" también lo es para esta regla; quién decide taparlo
//! es el bot, que sabe qué números son de alguien (ver src/core/egress.ts).

use serde::Serialize;

/// Como `Max_Texto` en Ada: 1 MiB.
pub const MAX_TEXTO: usize = 1 << 20;
pub const MIN_DIGITOS: usize = 6;
pub const MAX_DIGITOS: usize = 20;
const MAX_SALIDA: usize = 5 + 3 * (MAX_DIGITOS - 5);
const MAX_JID: usize = 128;

#[cfg(winsi_ada)]
extern "C" {
    fn winsi_phone_find(
        texto: *const u8,
        largo: i32,
        desde: i32,
        ini: *mut i32,
        fin: *mut i32,
        res: *mut i32,
    );
    fn winsi_phone_mask(digitos: *const u8, n: i32, salida: *mut u8, res: *mut i32);
    fn winsi_phone_jid(jid: *const u8, largo: i32, fin: *mut i32, res: *mut i32);
}

fn dig(b: u8) -> bool {
    b.is_ascii_digit()
}
fn alnum(b: u8) -> bool {
    b.is_ascii_alphanumeric()
}
fn sep(b: u8) -> bool {
    matches!(b, b' ' | b'-' | b'.' | b'(' | b')')
}

/// El primer número desde `desde` (base 1, como en Ada): `(ini, fin, dígitos)`,
/// con `ini` y `fin` base 1 e inclusivos.
pub fn buscar_uno(t: &[u8], desde: usize) -> Option<(usize, usize, usize)> {
    if t.len() > MAX_TEXTO || desde == 0 || desde > t.len() + 1 {
        return None;
    }
    buscar_uno_ffi(t, desde)
}

#[cfg(winsi_ada)]
fn buscar_uno_ffi(t: &[u8], desde: usize) -> Option<(usize, usize, usize)> {
    let (mut ini, mut fin, mut res) = (0i32, 0i32, 0i32);
    // SAFETY: `t` mide `largo` bytes, a lo sumo MAX_TEXTO; GNATprove demuestra
    // que Buscar_C solo lee las posiciones 1 .. largo.
    unsafe {
        winsi_phone_find(
            t.as_ptr(),
            t.len() as i32,
            desde as i32,
            &mut ini,
            &mut fin,
            &mut res,
        )
    };
    (res > 0).then_some((ini as usize, fin as usize, res as usize))
}

#[cfg(not(winsi_ada))]
fn buscar_uno_ffi(t: &[u8], desde: usize) -> Option<(usize, usize, usize)> {
    buscar_uno_rust(t, desde)
}

/// La misma regla que `Phone_Guard.Buscar_C`, paso por paso.
pub fn buscar_uno_rust(t: &[u8], desde: usize) -> Option<(usize, usize, usize)> {
    let l = t.len();
    let mut i = desde;
    while i <= l {
        if dig(t[i - 1]) && (i == 1 || !alnum(t[i - 2])) {
            let (mut j, mut f, mut d) = (i + 1, i, 1);
            while j <= l {
                let b = t[j - 1];
                if dig(b) {
                    d += 1;
                    f = j;
                } else if sep(b)
                    && ((j < l && dig(t[j])) || (j + 2 <= l && sep(t[j]) && dig(t[j + 1])))
                {
                } else {
                    break;
                }
                j += 1;
            }
            if (MIN_DIGITOS..=MAX_DIGITOS).contains(&d) && (f == l || !alnum(t[f])) {
                let ini = if i > desde && t[i - 2] == b'+' {
                    i - 1
                } else {
                    i
                };
                return Some((ini, f, d));
            }
            i = f + 1;
        } else {
            i += 1;
        }
    }
    None
}

/// `51924360740` → `51••••••740`. `None` si no son de 6 a 20 dígitos.
pub fn enmascarar(digitos: &[u8]) -> Option<String> {
    if digitos.len() > MAX_DIGITOS {
        return None;
    }
    let mut d = [0u8; MAX_DIGITOS];
    d[..digitos.len()].copy_from_slice(digitos);
    let (sal, n) = enmascarar_ffi(&d, digitos.len() as i32)?;
    String::from_utf8(sal[..n].to_vec()).ok()
}

#[cfg(winsi_ada)]
fn enmascarar_ffi(d: &[u8; MAX_DIGITOS], n: i32) -> Option<([u8; MAX_SALIDA], usize)> {
    let mut sal = [0u8; MAX_SALIDA];
    let mut res = -1i32;
    // SAFETY: arreglos del tamaño exacto de los tipos de Ada.
    unsafe { winsi_phone_mask(d.as_ptr(), n, sal.as_mut_ptr(), &mut res) };
    (res >= 0).then_some((sal, res as usize))
}

#[cfg(not(winsi_ada))]
fn enmascarar_ffi(d: &[u8; MAX_DIGITOS], n: i32) -> Option<([u8; MAX_SALIDA], usize)> {
    enmascarar_rust(d, n)
}

/// La misma regla que `Phone_Guard.Enmascarar_C`.
pub fn enmascarar_rust(d: &[u8; MAX_DIGITOS], n: i32) -> Option<([u8; MAX_SALIDA], usize)> {
    let m = usize::try_from(n).ok()?;
    if !(MIN_DIGITOS..=MAX_DIGITOS).contains(&m) || !d[..m].iter().all(|&b| dig(b)) {
        return None;
    }
    let mut sal = [0u8; MAX_SALIDA];
    let mut k = 0;
    for (i, &b) in d[..m].iter().enumerate() {
        if i < 2 || i >= m - 3 {
            sal[k] = b;
            k += 1;
        } else {
            sal[k..k + 3].copy_from_slice("•".as_bytes());
            k += 3;
        }
    }
    Some((sal, k))
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum TipoJid {
    Numero,
    Lid,
    Grupo,
    Otro,
}

/// De qué es un JID y su número: `51924360740:12@s.whatsapp.net` →
/// `(Numero, "51924360740")`. `None` si no empieza con un número.
pub fn leer_jid(jid: &str) -> Option<(TipoJid, &str)> {
    let b = jid.as_bytes();
    if b.is_empty() || b.len() > MAX_JID {
        return None;
    }
    let mut t = [0u8; MAX_JID];
    t[..b.len()].copy_from_slice(b);
    let (tipo, fin) = leer_jid_ffi(&t, b.len() as i32)?;
    Some((tipo, &jid[..fin]))
}

#[cfg(winsi_ada)]
fn tipo_de(res: i32) -> Option<TipoJid> {
    match res {
        1 => Some(TipoJid::Numero),
        2 => Some(TipoJid::Lid),
        3 => Some(TipoJid::Grupo),
        4 => Some(TipoJid::Otro),
        _ => None,
    }
}

#[cfg(winsi_ada)]
fn leer_jid_ffi(t: &[u8; MAX_JID], largo: i32) -> Option<(TipoJid, usize)> {
    let (mut fin, mut res) = (0i32, 0i32);
    // SAFETY: un arreglo de MAX_JID bytes; Leer_Jid_C solo lee 1 .. largo.
    unsafe { winsi_phone_jid(t.as_ptr(), largo, &mut fin, &mut res) };
    Some((tipo_de(res)?, fin as usize))
}

#[cfg(not(winsi_ada))]
fn leer_jid_ffi(t: &[u8; MAX_JID], largo: i32) -> Option<(TipoJid, usize)> {
    leer_jid_rust(t, largo)
}

/// La misma regla que `Phone_Guard.Leer_Jid_C`.
pub fn leer_jid_rust(t: &[u8; MAX_JID], largo: i32) -> Option<(TipoJid, usize)> {
    let l = usize::try_from(largo)
        .ok()
        .filter(|l| (1..=MAX_JID).contains(l))?;
    let t = &t[..l];
    let k = t.iter().take(MAX_DIGITOS).take_while(|&&b| dig(b)).count();
    if k == 0 || k >= l || !matches!(t[k], b':' | b'@') {
        return None;
    }
    let mut a = k;
    if t[a] == b':' {
        a += 1;
        while a < l && dig(t[a]) {
            a += 1;
        }
        if a >= l || t[a] != b'@' {
            return None;
        }
    }
    let tipo = match &t[a + 1..] {
        b"s.whatsapp.net" | b"c.us" => TipoJid::Numero,
        b"lid" => TipoJid::Lid,
        b"g.us" => TipoJid::Grupo,
        [] => return None,
        _ => TipoJid::Otro,
    };
    Some((tipo, k))
}

/// Un número encontrado en un texto, con su posición en unidades UTF-16 —como
/// cuenta JavaScript—, para que el bot lo reemplace sin convertir nada.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Numero {
    pub ini: usize,
    pub fin: usize,
    pub digitos: String,
    pub tapado: String,
}

/// Todos los números de un texto.
pub fn buscar(texto: &str) -> Vec<Numero> {
    let t = texto.as_bytes();
    let mut out = Vec::new();
    let (mut desde, mut u16_hasta, mut byte_hasta) = (1, 0, 0);
    while let Some((ini, fin, _)) = buscar_uno(t, desde) {
        let digitos: Vec<u8> = t[ini - 1..fin]
            .iter()
            .copied()
            .filter(|&b| dig(b))
            .collect();
        // El tramo empieza y termina en ASCII: son bordes de carácter.
        let u_ini = u16_hasta + texto[byte_hasta..ini - 1].encode_utf16().count();
        let u_fin = u_ini + (fin - ini + 1);
        (u16_hasta, byte_hasta) = (u_fin, fin);
        if let Some(tapado) = enmascarar(&digitos) {
            out.push(Numero {
                ini: u_ini,
                fin: u_fin,
                digitos: String::from_utf8(digitos).unwrap_or_default(),
                tapado,
            });
        }
        desde = fin + 1;
    }
    out
}

/// El texto con TODOS sus números tapados, sean de quien sean. Para lo que se
/// guarda en disco (ver privacy.rs): ahí un número no le sirve a nadie, y un
/// monto tapado no cambia el estilo de cómo escribe alguien.
pub fn tapar_todos(texto: &str) -> std::borrow::Cow<'_, str> {
    let t = texto.as_bytes();
    let mut out = String::new();
    let (mut desde, mut copiado) = (1, 0);
    while let Some((ini, fin, _)) = buscar_uno(t, desde) {
        let digitos: Vec<u8> = t[ini - 1..fin]
            .iter()
            .copied()
            .filter(|&b| dig(b))
            .collect();
        if let Some(tapado) = enmascarar(&digitos) {
            // `ini` y `fin` caen en bytes ASCII: son bordes de carácter.
            out.push_str(&texto[copiado..ini - 1]);
            out.push_str(&tapado);
            copiado = fin;
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
    fn tapar_todos_tapa_cualquier_numero() {
        assert_eq!(
            tapar_todos("ñ 51924360740 y 1.000.000.000 😄 12345"),
            "ñ 51••••••740 y 10•••••000 😄 12345"
        );
        assert!(matches!(
            tapar_todos("sin números"),
            std::borrow::Cow::Borrowed(_)
        ));
    }

    fn numeros(t: &str) -> Vec<(String, String)> {
        buscar(t)
            .into_iter()
            .map(|n| (n.digitos, n.tapado))
            .collect()
    }

    #[test]
    fn encuentra_y_tapa_los_numeros() {
        assert_eq!(
            numeros("mi numero es +51 924-360-740, escribime"),
            vec![("51924360740".into(), "51••••••740".into())]
        );
        assert_eq!(
            numeros("@31908117356669 hola"),
            vec![("31908117356669".into(), "31•••••••••669".into())]
        );
        assert_eq!(numeros("(51) 924 360 740").len(), 1);
        // Pegado a letras, muy corto o muy largo: no.
        for no in [
            "abc924360740",
            "924360740x",
            "12345",
            &"1".repeat(21),
            "1 2",
        ] {
            assert!(numeros(no).is_empty(), "{no:?}");
        }
        // Dos en el mismo texto, y la posición en UTF-16.
        let t = "ñandú 924360740 y 51987654321";
        let n = buscar(t);
        assert_eq!(n.len(), 2);
        let u: Vec<u16> = t.encode_utf16().collect();
        assert_eq!(
            String::from_utf16(&u[n[0].ini..n[0].fin]).unwrap(),
            "924360740"
        );
        assert_eq!(
            String::from_utf16(&u[n[1].ini..n[1].fin]).unwrap(),
            "51987654321"
        );
    }

    #[test]
    fn la_mascara_deja_ver_dos_y_tres() {
        assert_eq!(enmascarar(b"924360").as_deref(), Some("92•360"));
        assert_eq!(enmascarar(b"51924360740").as_deref(), Some("51••••••740"));
        assert_eq!(enmascarar(b"12345"), None);
        assert_eq!(enmascarar(&[b'1'; 21]), None);
        assert_eq!(enmascarar(b"51924a60740"), None);
    }

    #[test]
    fn lee_los_jid() {
        assert_eq!(
            leer_jid("51924360740@s.whatsapp.net"),
            Some((TipoJid::Numero, "51924360740"))
        );
        assert_eq!(
            leer_jid("51924360740:12@s.whatsapp.net"),
            Some((TipoJid::Numero, "51924360740"))
        );
        assert_eq!(
            leer_jid("31908117356669@lid"),
            Some((TipoJid::Lid, "31908117356669"))
        );
        assert_eq!(
            leer_jid("120363363621316758@g.us"),
            Some((TipoJid::Grupo, "120363363621316758"))
        );
        assert_eq!(
            leer_jid("51924360740@broadcast").map(|j| j.0),
            Some(TipoJid::Otro)
        );
        for no in [
            "",
            "@lid",
            "abc@lid",
            "519@",
            "5192:x@lid",
            "status@broadcast",
        ] {
            assert_eq!(leer_jid(no), None, "{no:?}");
        }
    }

    /// Un generador chico y determinista, para no sumar `rand`.
    #[cfg(winsi_ada)]
    struct Azar(u64);
    #[cfg(winsi_ada)]
    impl Azar {
        fn n(&mut self, max: usize) -> usize {
            self.0 ^= self.0 << 13;
            self.0 ^= self.0 >> 7;
            self.0 ^= self.0 << 17;
            (self.0 % max as u64) as usize
        }
    }

    #[cfg(winsi_ada)]
    #[test]
    fn rust_y_ada_buscan_lo_mismo() {
        // Todas las cadenas de hasta 8 bytes de un alfabeto que ejercita cada
        // rama: dígito, '+', separadores, letra y un byte de UTF-8.
        let alfabeto = [b'1', b'+', b' ', b'-', b'(', b'a', 0xE2];
        let mut t = Vec::with_capacity(8);
        for largo in 0..=8u32 {
            for n in 0..(alfabeto.len() as u64).pow(largo) {
                t.clear();
                let mut m = n;
                for _ in 0..largo {
                    t.push(alfabeto[(m % alfabeto.len() as u64) as usize]);
                    m /= alfabeto.len() as u64;
                }
                for desde in 1..=t.len() + 1 {
                    assert_eq!(
                        buscar_uno_ffi(&t, desde),
                        buscar_uno_rust(&t, desde),
                        "{t:?} desde {desde}"
                    );
                }
            }
        }
        // Y textos largos al azar, con números de verdad adentro.
        let piezas: [&[u8]; 10] = [
            b"51924360740",
            b"+51 924 360 740",
            b"@31908117356669",
            b" ",
            b"hola",
            b"(51) 924-360-740",
            b"1234",
            b"x",
            "ñ".as_bytes(),
            b"12345678901234567890123",
        ];
        let mut a = Azar(0x9E37_79B9_7F4A_7C15);
        for _ in 0..200_000 {
            t.clear();
            for _ in 0..a.n(12) {
                t.extend_from_slice(piezas[a.n(piezas.len())]);
            }
            let desde = 1 + a.n(t.len() + 1);
            assert_eq!(
                buscar_uno_ffi(&t, desde),
                buscar_uno_rust(&t, desde),
                "{t:?}"
            );
        }
    }

    #[cfg(winsi_ada)]
    #[test]
    fn rust_y_ada_tapan_lo_mismo() {
        let mut a = Azar(42);
        for n in -3..=24i32 {
            for _ in 0..2_000 {
                let mut d = [0u8; MAX_DIGITOS];
                for b in d.iter_mut() {
                    *b = if a.n(40) == 0 {
                        b'a'
                    } else {
                        b'0' + a.n(10) as u8
                    };
                }
                let ada = enmascarar_ffi(&d, n);
                assert_eq!(ada, enmascarar_rust(&d, n), "n {n}");
                if let Some((sal, len)) = ada {
                    // Lo que GNATprove demuestra, mirado desde afuera.
                    let s = std::str::from_utf8(&sal[..len]).unwrap();
                    assert_eq!(s.bytes().filter(|b| b.is_ascii_digit()).count(), 5);
                }
            }
        }
    }

    #[cfg(winsi_ada)]
    #[test]
    fn rust_y_ada_leen_los_mismos_jid() {
        let piezas: [&[u8]; 9] = [
            b"5",
            b"51924360740",
            b":",
            b"12",
            b"@",
            b"s.whatsapp.net",
            b"lid",
            b"g.us",
            b"x",
        ];
        let mut a = Azar(7);
        for _ in 0..300_000 {
            let mut t = [0u8; MAX_JID];
            let mut l = 0;
            for _ in 0..a.n(7) {
                let p = piezas[a.n(piezas.len())];
                if l + p.len() > MAX_JID {
                    break;
                }
                t[l..l + p.len()].copy_from_slice(p);
                l += p.len();
            }
            for largo in [l as i32, l as i32 - 1, 0, -1, 129] {
                assert_eq!(
                    leer_jid_ffi(&t, largo),
                    leer_jid_rust(&t, largo),
                    "{:?}",
                    &t[..l]
                );
            }
        }
    }

    /// Los casos que la copia en TypeScript tiene que dar igual. Con
    /// `WINSI_ESCRIBIR_VECTORES=1` se reescribe el archivo; sin eso, se
    /// comprueba que siga al día.
    #[test]
    fn vectores_para_typescript() {
        let textos = [
            "mi numero es +51 924-360-740, escribime",
            "@31908117356669 hola",
            "(51) 924 360 740",
            "abc924360740",
            "924360740x",
            "12345",
            "123456",
            "1 2 3 4 5 6",
            "1  2  3",
            "123456789012345678901",
            "Tienes 10000000000 monedas",
            "1.000.000 y 2.500.000.000",
            "ñandú 924360740 y 51987654321 😄 +54 9 11 2345-6789",
            "51924360740:12@s.whatsapp.net",
            "a+51924360740",
            "+-51924360740",
            "",
        ];
        let jids = [
            "51924360740@s.whatsapp.net",
            "51924360740:12@s.whatsapp.net",
            "31908117356669@lid",
            "120363363621316758@g.us",
            "51924360740@broadcast",
            "51924360740@c.us",
            "status@broadcast",
            "@lid",
            "519@",
            "5192:@lid",
            "123456789012345678901@lid",
        ];
        let v = serde_json::json!({
            "buscar": textos.iter().map(|t| serde_json::json!({ "texto": t, "numeros": buscar(t) })).collect::<Vec<_>>(),
            "jid": jids.iter().map(|j| serde_json::json!({
                "jid": j,
                "leido": leer_jid(j).map(|(tipo, n)| serde_json::json!({ "tipo": tipo, "numero": n })),
            })).collect::<Vec<_>>(),
        });
        let ruta = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../../scripts/phone_guard.vectors.json");
        let nuevo = serde_json::to_string_pretty(&v).unwrap() + "\n";
        if std::env::var("WINSI_ESCRIBIR_VECTORES").is_ok() {
            std::fs::write(&ruta, &nuevo).unwrap();
        }
        let actual = std::fs::read_to_string(&ruta)
            .unwrap_or_default()
            .replace("\r\n", "\n");
        assert_eq!(actual, nuevo, "correr con WINSI_ESCRIBIR_VECTORES=1");
    }
}
