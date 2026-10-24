//! CRC32, varints y el hash del filtro Bloom. Todo en std.

/// Tabla del CRC32 IEEE (el de zlib, gzip, PNG), calculada al compilar.
const fn tabla_crc() -> [u32; 256] {
    let mut t = [0u32; 256];
    let mut i = 0;
    while i < 256 {
        let mut c = i as u32;
        let mut k = 0;
        while k < 8 {
            c = if c & 1 != 0 { 0xEDB8_8320 ^ (c >> 1) } else { c >> 1 };
            k += 1;
        }
        t[i] = c;
        i += 1;
    }
    t
}

static TABLA_CRC: [u32; 256] = tabla_crc();

pub fn crc32(datos: &[u8]) -> u32 {
    let mut c = !0u32;
    for &b in datos {
        c = TABLA_CRC[((c ^ b as u32) & 0xff) as usize] ^ (c >> 8);
    }
    !c
}

pub fn poner_varint(buf: &mut Vec<u8>, mut v: u64) {
    while v >= 0x80 {
        buf.push((v as u8) | 0x80);
        v >>= 7;
    }
    buf.push(v as u8);
}

/// Lee un varint desde `*pos`; `None` si se corta o es más largo que un u64.
pub fn leer_varint(buf: &[u8], pos: &mut usize) -> Option<u64> {
    let mut v = 0u64;
    let mut corr = 0;
    loop {
        let b = *buf.get(*pos)?;
        *pos += 1;
        if corr >= 64 {
            return None;
        }
        v |= ((b & 0x7f) as u64) << corr;
        if b & 0x80 == 0 {
            return Some(v);
        }
        corr += 7;
    }
}

/// `n` bytes desde `*pos`, o `None` si no alcanzan.
pub fn leer_bytes<'a>(buf: &'a [u8], pos: &mut usize, n: usize) -> Option<&'a [u8]> {
    let fin = pos.checked_add(n)?;
    let s = buf.get(*pos..fin)?;
    *pos = fin;
    Some(s)
}

/// FNV-1a de 64 bits con el final de splitmix64: rápido y bien repartido,
/// que es lo único que pide un Bloom (no tiene que ser criptográfico).
pub fn hash64(datos: &[u8]) -> u64 {
    let mut h = 0xcbf2_9ce4_8422_2325u64;
    for &b in datos {
        h ^= b as u64;
        h = h.wrapping_mul(0x0000_0100_0000_01b3);
    }
    mezclar(h)
}

pub fn mezclar(mut z: u64) -> u64 {
    z = (z ^ (z >> 30)).wrapping_mul(0xbf58_476d_1ce4_e5b9);
    z = (z ^ (z >> 27)).wrapping_mul(0x94d0_49bb_1331_11eb);
    z ^ (z >> 31)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn crc32_conocido() {
        // El valor de referencia del CRC32 IEEE.
        assert_eq!(crc32(b"123456789"), 0xCBF4_3926);
        assert_eq!(crc32(b""), 0);
    }

    #[test]
    fn varint_ida_y_vuelta() {
        for v in [0u64, 1, 127, 128, 300, 16_383, 16_384, u32::MAX as u64, u64::MAX] {
            let mut b = Vec::new();
            poner_varint(&mut b, v);
            let mut p = 0;
            assert_eq!(leer_varint(&b, &mut p), Some(v));
            assert_eq!(p, b.len());
        }
    }

    #[test]
    fn varint_cortado_no_entra_en_panico() {
        let mut p = 0;
        assert_eq!(leer_varint(&[0x80, 0x80], &mut p), None);
        let mut p = 0;
        assert_eq!(leer_varint(&[0xff; 20], &mut p), None);
    }
}
