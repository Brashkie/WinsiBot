//! Leer un monto que escribe alguien: #pay 1.000, #bank 500, #cf cara 2k…
//!
//! La regla está en Ada/SPARK (`ada/src/amount_parser.ads`) y GNATprove
//! demuestra, para todo texto, que acepta exactamente la gramática de
//! `montoDe` —dígitos, o dígitos con el mismo separador de miles cada tres
//! cifras—, que el valor es exactamente el de esos dígitos y que nunca se
//! desborda. Con la feature `ada` se enlaza ese objeto; sin ella decide la
//! copia de abajo, comparada contra Ada en todas las tiras de hasta 7
//! caracteres y en un millón de tiras largas al azar.
//!
//! El bot lee los montos en TypeScript (src/lib/amount.ts), en el mismo paso
//! que el comando: ir a la Session API por cada monto sumaría un viaje. Por
//! eso `montoDe` es una copia más, atada a esta regla por [`HUELLA`]: el test
//! de acá y el de scripts/amount.test.js recorren las mismas tiras y tienen
//! que dar la misma huella.

/// Number.MAX_SAFE_INTEGER, como `Max_Monto` en Ada.
pub const MAX_MONTO: i64 = (1 << 53) - 1;
/// Como `Max_Largo` en Ada: una tira más larga no es un monto.
pub const MAX_LARGO: usize = 32;

/// Los códigos de `Leer_C`.
pub const ES_MONTO: i32 = 0;
pub const NO_ES_MONTO: i32 = 1;
pub const DESBORDA: i32 = 2;

/// La huella de la regla sobre todas las tiras de hasta 7 caracteres de
/// [`ALFABETO`] (ver [`huella`]). La misma constante está en
/// scripts/amount.test.js: si cambia la regla, cambian las dos.
pub const HUELLA: u32 = 1_033_130_042;
pub const ALFABETO: &[u8; 8] = b"059.,_ x";

#[cfg(winsi_ada)]
extern "C" {
    fn winsi_amount_read(texto: *const u8, largo: i32, valor: *mut i64, codigo: *mut i32);
}

/// El monto, o `None` si el texto no es un monto (o pasa de [`MAX_MONTO`]).
pub fn leer(texto: &str) -> Option<i64> {
    let t = texto.trim().as_bytes();
    if t.len() > MAX_LARGO {
        return None;
    }
    let mut buf = [0u8; MAX_LARGO];
    buf[..t.len()].copy_from_slice(t);
    match leer_buf(&buf, t.len() as i32) {
        (ES_MONTO, v) => Some(v),
        _ => None,
    }
}

/// (código, valor). Ada si se enlazó; si no, la copia.
#[cfg(winsi_ada)]
pub fn leer_buf(t: &[u8; MAX_LARGO], largo: i32) -> (i32, i64) {
    let (mut v, mut c) = (0i64, 0i32);
    // SAFETY: un arreglo de MAX_LARGO bytes y dos locales; GNATprove demuestra
    // que la función no lee fuera del arreglo ni tiene errores en ejecución.
    unsafe { winsi_amount_read(t.as_ptr(), largo, &mut v, &mut c) };
    (c, v)
}

#[cfg(not(winsi_ada))]
pub fn leer_buf(t: &[u8; MAX_LARGO], largo: i32) -> (i32, i64) {
    leer_rust(t, largo)
}

fn es_digito(b: u8) -> bool {
    b.is_ascii_digit()
}

fn es_separador(b: u8) -> bool {
    matches!(b, b'.' | b',' | b'_' | b' ')
}

/// La misma regla que `Amount_Parser.Leer_C`.
pub fn leer_rust(t: &[u8; MAX_LARGO], largo: i32) -> (i32, i64) {
    if !(0..=MAX_LARGO as i32).contains(&largo) {
        return (NO_ES_MONTO, 0);
    }
    let t = &t[..largo as usize];
    let n = t.len();
    let solo_digitos = t.iter().all(|&b| es_digito(b));
    let con_miles = || {
        let k = n % 4;
        n >= 5
            && k != 0
            && es_separador(t[k])
            && t.iter().enumerate().all(|(i, &b)| {
                if i >= k && (i - k).is_multiple_of(4) {
                    b == t[k]
                } else {
                    es_digito(b)
                }
            })
    };
    if n == 0 || !(solo_digitos || con_miles()) {
        return (NO_ES_MONTO, 0);
    }
    let mut v = 0i64;
    for &b in t.iter().filter(|&&b| es_digito(b)) {
        v = (MAX_MONTO + 1).min(v * 10 + i64::from(b - b'0'));
    }
    if v > MAX_MONTO {
        (DESBORDA, 0)
    } else {
        (ES_MONTO, v)
    }
}

/// FNV-1a de 32 bits sobre el resultado de cada tira de hasta 7 caracteres
/// de [`ALFABETO`], en orden: primero por largo, después como un número en
/// base 8 con el primer carácter como la cifra más alta. Cada resultado es
/// el monto, o 0xFFFFFFFF si no es un monto. Ninguno pasa de 9.999.999.
pub fn huella(leer: impl Fn(&str) -> Option<i64>) -> u32 {
    let mut h: u32 = 0x811C_9DC5;
    let mut tira = String::with_capacity(7);
    for largo in 0..=7u32 {
        for mut k in 0..8u32.pow(largo) {
            tira.clear();
            let mut cifras = [0u8; 7];
            for i in (0..largo as usize).rev() {
                cifras[i] = ALFABETO[(k % 8) as usize];
                k /= 8;
            }
            tira.extend(cifras[..largo as usize].iter().map(|&b| b as char));
            let r = leer(&tira).map_or(u32::MAX, |v| v as u32);
            h = (h ^ r).wrapping_mul(0x0100_0193);
        }
    }
    h
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn los_montos_de_siempre() {
        assert_eq!(leer("500"), Some(500));
        assert_eq!(leer(" 500 "), Some(500));
        assert_eq!(leer("1.000"), Some(1000));
        assert_eq!(leer("1,000"), Some(1000));
        assert_eq!(leer("1 000 000"), Some(1_000_000));
        assert_eq!(leer("1_000"), Some(1000));
        assert_eq!(leer("0"), Some(0));
        assert_eq!(leer("9007199254740991"), Some(MAX_MONTO));
        assert_eq!(leer("9,007,199,254,740,991"), Some(MAX_MONTO));
        for t in [
            "",
            "   ",
            "abc",
            "12abc",
            "0x10",
            "1e9",
            "-5",
            "1.5",
            "1.00",
            "10.0000",
            "1.000,000",
            "1..000",
        ] {
            assert_eq!(leer(t), None, "{t:?}");
        }
        assert_eq!(leer("9007199254740992"), None);
        assert_eq!(leer(&"9".repeat(32)), None);
        assert_eq!(leer(&"9".repeat(400)), None);
        assert_eq!(leer(&format!("{}1", "0".repeat(32))), None, "33 caracteres");
    }

    #[test]
    fn la_huella_es_la_de_typescript() {
        assert_eq!(
            huella(leer),
            HUELLA,
            "cambió la regla: actualizar HUELLA aquí y en scripts/amount.test.js"
        );
    }

    /// xorshift: entradas al azar reproducibles, sin dependencias.
    #[cfg(winsi_ada)]
    fn azar(semilla: &mut u64) -> u64 {
        *semilla ^= *semilla << 13;
        *semilla ^= *semilla >> 7;
        *semilla ^= *semilla << 17;
        *semilla
    }

    #[cfg(winsi_ada)]
    #[test]
    fn rust_y_ada_dan_lo_mismo() {
        assert_eq!(
            huella(|t| {
                let t = t.trim().as_bytes();
                let mut buf = [0u8; MAX_LARGO];
                buf[..t.len()].copy_from_slice(t);
                match leer_rust(&buf, t.len() as i32) {
                    (ES_MONTO, v) => Some(v),
                    _ => None,
                }
            }),
            huella(leer)
        );
        // Tiras largas: los bordes del desborde, con y sin separadores, y
        // largos de C fuera de rango.
        let mut s = 0x9E37_79B9_7F4A_7C15u64;
        let piezas = b"0123456789.,_ x9";
        for _ in 0..1_000_000 {
            let mut buf = [0u8; MAX_LARGO];
            for b in buf.iter_mut() {
                let r = azar(&mut s);
                // Casi siempre dígitos, para llegar a montos de 16 cifras.
                *b = if r % 8 < 6 {
                    b'0' + (r >> 8) as u8 % 10
                } else {
                    piezas[(r >> 16) as usize % piezas.len()]
                };
            }
            if azar(&mut s).is_multiple_of(2) {
                // Con miles bien puestos, para que pasen la gramática.
                let sep = b".,_ "[(azar(&mut s) % 4) as usize];
                let k = 1 + (azar(&mut s) % 3) as usize;
                let mut i = k;
                while i < MAX_LARGO {
                    buf[i] = sep;
                    i += 4;
                }
            }
            let largo = (azar(&mut s) % 40) as i32 - 4;
            assert_eq!(
                leer_buf(&buf, largo),
                leer_rust(&buf, largo),
                "{:?} {largo}",
                String::from_utf8_lossy(&buf)
            );
        }
    }
}
