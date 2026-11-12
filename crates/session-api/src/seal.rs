//! Sellar y abrir: ChaCha20-Poly1305 (RFC 8439), el formato con el que
//! WinsiBot guarda cifrada la sesión de WhatsApp.
//!
//! Quien copie los archivos de la sesión entra a WhatsApp como el bot. Por eso
//! se guardan **sellados**: cifrados y autenticados, con una clave que custodia
//! la Session API ([`crate::vault`]). Un byte cambiado, otra clave o un archivo
//! puesto en el lugar de otro —el nombre va en los datos asociados— no se abre.
//!
//! El formato es el mismo en los dos lados: el bot sella `auth/` con
//! `chacha20-poly1305` de Node (`src/lib/authSeal.ts`), y la Session API sella
//! sus respaldos de `creds.json` con este módulo. Lo que sella uno lo abre el
//! otro, y los tests lo comprueban con vectores hechos por Node.
//!
//! ```text
//! "WSB1" | nonce (12) | etiqueta (16) | cifrado (lo que mida el texto)
//! ```
//!
//! El nonce es al azar, del sistema operativo: con 96 bits, que dos escrituras
//! repitan uno es despreciable para los miles de escrituras de una sesión.
//!
//! Con la feature `ada` sellan ChaCha20 y Poly1305 de **SPARKNaCl**, en SPARK
//! con la ausencia de errores de ejecución demostrada, compuestos como dice el
//! RFC en `ada/src/sealed_box.adb`, también demostrado. Sin ella —Android
//! y Linux ARM, donde no hay GNAT— sella la copia en Rust de abajo, escrita del
//! RFC y comparada con SPARKNaCl, con los vectores del RFC y con Node.

/// Los primeros bytes de un archivo sellado.
pub const MARCA: &[u8; 4] = b"WSB1";
const CABECERA: usize = 4 + 12 + 16;

/// El tope del texto: el de `Sealed_Box.Max_Datos`.
pub const MAX_DATOS: usize = 1_048_576;
/// El tope de los datos asociados: el de `Sealed_Box.Max_Aad`.
pub const MAX_AAD: usize = 256;
/// El búfer donde Ada arma el mensaje de Poly1305: `Sealed_Box.Max_Trabajo`.
#[cfg(winsi_ada)]
const MAX_TRABAJO: usize = MAX_AAD + MAX_DATOS + 16;

#[derive(Debug, PartialEq, Eq)]
pub enum ErrorSello {
    /// No empieza con `WSB1` o es más corto que la cabecera.
    NoSellado,
    /// La etiqueta no coincide: otra clave, otro nombre o un byte cambiado.
    NoCoincide,
    /// Vacío o más grande que el tope.
    Largo,
    /// El sistema no dio bytes al azar para el nonce.
    Azar,
}

impl std::fmt::Display for ErrorSello {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(match self {
            ErrorSello::NoSellado => "no está sellado",
            ErrorSello::NoCoincide => {
                "la etiqueta no coincide (otra clave, otro nombre o un byte cambiado)"
            }
            ErrorSello::Largo => "vacío o más grande que el tope",
            ErrorSello::Azar => "el sistema no dio bytes al azar",
        })
    }
}

impl std::error::Error for ErrorSello {}

/// Si `b` empieza como un archivo sellado.
pub fn esta_sellado(b: &[u8]) -> bool {
    b.len() >= CABECERA && &b[..4] == MARCA
}

/// Sella `datos` con un nonce al azar.
pub fn sellar(clave: &[u8; 32], aad: &[u8], datos: &[u8]) -> Result<Vec<u8>, ErrorSello> {
    let mut nonce = [0u8; 12];
    getrandom::fill(&mut nonce).map_err(|_| ErrorSello::Azar)?;
    sellar_con_nonce(clave, &nonce, aad, datos)
}

/// Sella con un nonce dado. Solo para los tests y los vectores: un nonce no se
/// repite nunca con la misma clave.
pub fn sellar_con_nonce(
    clave: &[u8; 32],
    nonce: &[u8; 12],
    aad: &[u8],
    datos: &[u8],
) -> Result<Vec<u8>, ErrorSello> {
    if datos.is_empty() || datos.len() > MAX_DATOS || aad.is_empty() || aad.len() > MAX_AAD {
        return Err(ErrorSello::Largo);
    }
    let (cifrado, etiqueta) = aead_sellar(clave, nonce, aad, datos)?;
    let mut out = Vec::with_capacity(CABECERA + cifrado.len());
    out.extend_from_slice(MARCA);
    out.extend_from_slice(nonce);
    out.extend_from_slice(&etiqueta);
    out.extend_from_slice(&cifrado);
    Ok(out)
}

/// Abre lo que selló [`sellar`] (o el bot) con la misma clave y el mismo `aad`.
pub fn abrir(clave: &[u8; 32], aad: &[u8], sellado: &[u8]) -> Result<Vec<u8>, ErrorSello> {
    if !esta_sellado(sellado) {
        return Err(ErrorSello::NoSellado);
    }
    let nonce: [u8; 12] = sellado[4..16].try_into().expect("12 bytes");
    let etiqueta: [u8; 16] = sellado[16..32].try_into().expect("16 bytes");
    let cifrado = &sellado[CABECERA..];
    if cifrado.is_empty() || cifrado.len() > MAX_DATOS || aad.is_empty() || aad.len() > MAX_AAD {
        return Err(ErrorSello::Largo);
    }
    aead_abrir(clave, &nonce, aad, cifrado, &etiqueta)
}

// ─── El AEAD: SPARKNaCl con la feature `ada`, la copia en Rust sin ella ──────

#[cfg(winsi_ada)]
extern "C" {
    fn winsi_aead_sellar(
        clave: *const u8,
        nonce: *const u8,
        aad: *const u8,
        largo_aad: i32,
        m: *const u8,
        largo: i32,
        c: *mut u8,
        etiqueta: *mut u8,
        trabajo: *mut u8,
        estado: *mut i32,
    );
    fn winsi_aead_abrir(
        clave: *const u8,
        nonce: *const u8,
        aad: *const u8,
        largo_aad: i32,
        c: *const u8,
        largo: i32,
        etiqueta: *const u8,
        m: *mut u8,
        trabajo: *mut u8,
        estado: *mut i32,
    );
}

/// Dos símbolos del runtime de GNAT que piden funciones de SPARKNaCl que el
/// sello **no usa**: `HMAC-SHA256` (el sondeo de pila de MinGW, porque su
/// marco pasa de 4 KB) y `To_Byte_Seq` (la pila secundaria, porque devuelve un
/// arreglo de largo variable). El enlazador de MSVC no descarta funciones sin
/// usar dentro de un objeto, así que los pide igual.
///
/// - `___chkstk_ms` es la rutina de siempre de libgcc (`cygwin.S`): toca una
///   página de 4 KB por vez hasta el fondo del marco, para que la página de
///   guarda de Windows haga crecer la pila. Va de verdad, no de adorno: si un
///   día se llamara, hace lo que tiene que hacer.
/// - La pila secundaria no se puede imitar sin atarse a las tripas de una
///   versión de GNAT, así que si alguien la llamara, el proceso **aborta**: es
///   mejor caerse que seguir con memoria que nadie reservó. Ningún camino del
///   sello llega ahí; GNATprove demuestra `sealed_box`, y los tests lo corren
///   en largos de 1 a 1 MiB.
#[cfg(winsi_ada)]
mod runtime_ada {
    #[cfg(all(windows, target_arch = "x86_64"))]
    std::arch::global_asm!(
        ".globl ___chkstk_ms",
        "___chkstk_ms:",
        "pushq %rcx",
        "pushq %rax",
        "cmpq $0x1000, %rax",
        "leaq 24(%rsp), %rcx",
        "jb 2f",
        "1:",
        "subq $0x1000, %rcx",
        "orq $0x0, (%rcx)",
        "subq $0x1000, %rax",
        "cmpq $0x1000, %rax",
        "ja 1b",
        "2:",
        "subq %rax, %rcx",
        "orq $0x0, (%rcx)",
        "popq %rax",
        "popq %rcx",
        "ret",
        options(att_syntax)
    );

    #[no_mangle]
    extern "C" fn system__secondary_stack__ss_allocate() -> ! {
        std::process::abort()
    }
}

/// Los búferes que pide Ada: del tamaño del tope, porque así está declarado el
/// tipo. Se copia adentro lo que hay y el resto queda en cero.
#[cfg(winsi_ada)]
fn a_bufer<const N: usize>(b: &[u8]) -> Vec<u8> {
    let mut v = vec![0u8; N];
    v[..b.len()].copy_from_slice(b);
    v
}

#[cfg(winsi_ada)]
fn aead_sellar(
    clave: &[u8; 32],
    nonce: &[u8; 12],
    aad: &[u8],
    m: &[u8],
) -> Result<(Vec<u8>, [u8; 16]), ErrorSello> {
    let aad_b = a_bufer::<MAX_AAD>(aad);
    let m_b = a_bufer::<MAX_DATOS>(m);
    let mut c = vec![0u8; MAX_DATOS];
    let mut etiqueta = [0u8; 16];
    let mut trabajo = vec![0u8; MAX_TRABAJO];
    let mut estado = -1i32;
    // SAFETY: cada puntero apunta a un búfer del tamaño que declara Ada (32,
    // 12, 256, 1 MiB, 16 bytes y el de trabajo), y los largos están dentro
    // del tope (lo comprobó quien llama, y Ada lo vuelve a comprobar).
    unsafe {
        winsi_aead_sellar(
            clave.as_ptr(),
            nonce.as_ptr(),
            aad_b.as_ptr(),
            aad.len() as i32,
            m_b.as_ptr(),
            m.len() as i32,
            c.as_mut_ptr(),
            etiqueta.as_mut_ptr(),
            trabajo.as_mut_ptr(),
            &mut estado,
        );
    }
    match estado {
        0 => {
            c.truncate(m.len());
            Ok((c, etiqueta))
        }
        _ => Err(ErrorSello::Largo),
    }
}

#[cfg(winsi_ada)]
fn aead_abrir(
    clave: &[u8; 32],
    nonce: &[u8; 12],
    aad: &[u8],
    c: &[u8],
    etiqueta: &[u8; 16],
) -> Result<Vec<u8>, ErrorSello> {
    let aad_b = a_bufer::<MAX_AAD>(aad);
    let c_b = a_bufer::<MAX_DATOS>(c);
    let mut m = vec![0u8; MAX_DATOS];
    let mut trabajo = vec![0u8; MAX_TRABAJO];
    let mut estado = -1i32;
    // SAFETY: como en `aead_sellar`.
    unsafe {
        winsi_aead_abrir(
            clave.as_ptr(),
            nonce.as_ptr(),
            aad_b.as_ptr(),
            aad.len() as i32,
            c_b.as_ptr(),
            c.len() as i32,
            etiqueta.as_ptr(),
            m.as_mut_ptr(),
            trabajo.as_mut_ptr(),
            &mut estado,
        );
    }
    match estado {
        0 => {
            m.truncate(c.len());
            Ok(m)
        }
        2 => Err(ErrorSello::NoCoincide),
        _ => Err(ErrorSello::Largo),
    }
}

#[cfg(not(winsi_ada))]
fn aead_sellar(
    clave: &[u8; 32],
    nonce: &[u8; 12],
    aad: &[u8],
    m: &[u8],
) -> Result<(Vec<u8>, [u8; 16]), ErrorSello> {
    Ok(chacha::sellar(clave, nonce, aad, m))
}

#[cfg(not(winsi_ada))]
fn aead_abrir(
    clave: &[u8; 32],
    nonce: &[u8; 12],
    aad: &[u8],
    c: &[u8],
    etiqueta: &[u8; 16],
) -> Result<Vec<u8>, ErrorSello> {
    chacha::abrir(clave, nonce, aad, c, etiqueta).ok_or(ErrorSello::NoCoincide)
}

/// ChaCha20-Poly1305 en Rust, del RFC 8439: la copia para donde no hay GNAT.
///
/// ChaCha20 son sumas, rotaciones y xor de 32 bits, y Poly1305 va en cinco
/// limbs de 26 bits (el esquema de poly1305-donna): ninguna rama ni índice
/// depende de la clave ni de los datos, así que el tiempo no los delata. La
/// etiqueta se compara en tiempo constante.
pub mod chacha {
    fn le32(b: &[u8]) -> u32 {
        u32::from_le_bytes([b[0], b[1], b[2], b[3]])
    }

    /// Un bloque de 64 bytes del flujo de ChaCha20 (RFC 8439 §2.3).
    pub fn bloque(clave: &[u8; 32], contador: u32, nonce: &[u8; 12]) -> [u8; 64] {
        let mut s = [0u32; 16];
        s[0] = 0x6170_7865;
        s[1] = 0x3320_646e;
        s[2] = 0x7962_2d32;
        s[3] = 0x6b20_6574;
        for i in 0..8 {
            s[4 + i] = le32(&clave[4 * i..]);
        }
        s[12] = contador;
        for i in 0..3 {
            s[13 + i] = le32(&nonce[4 * i..]);
        }
        let mut x = s;
        macro_rules! qr {
            ($a:expr, $b:expr, $c:expr, $d:expr) => {
                x[$a] = x[$a].wrapping_add(x[$b]);
                x[$d] = (x[$d] ^ x[$a]).rotate_left(16);
                x[$c] = x[$c].wrapping_add(x[$d]);
                x[$b] = (x[$b] ^ x[$c]).rotate_left(12);
                x[$a] = x[$a].wrapping_add(x[$b]);
                x[$d] = (x[$d] ^ x[$a]).rotate_left(8);
                x[$c] = x[$c].wrapping_add(x[$d]);
                x[$b] = (x[$b] ^ x[$c]).rotate_left(7);
            };
        }
        for _ in 0..10 {
            qr!(0, 4, 8, 12);
            qr!(1, 5, 9, 13);
            qr!(2, 6, 10, 14);
            qr!(3, 7, 11, 15);
            qr!(0, 5, 10, 15);
            qr!(1, 6, 11, 12);
            qr!(2, 7, 8, 13);
            qr!(3, 4, 9, 14);
        }
        let mut out = [0u8; 64];
        for i in 0..16 {
            out[4 * i..4 * i + 4].copy_from_slice(&x[i].wrapping_add(s[i]).to_le_bytes());
        }
        out
    }

    /// Cifrar o descifrar (es lo mismo): xor con el flujo desde `contador`.
    pub fn xor(clave: &[u8; 32], contador: u32, nonce: &[u8; 12], datos: &mut [u8]) {
        for (i, trozo) in datos.chunks_mut(64).enumerate() {
            let k = bloque(clave, contador.wrapping_add(i as u32), nonce);
            for (d, f) in trozo.iter_mut().zip(k) {
                *d ^= f;
            }
        }
    }

    /// Poly1305 (RFC 8439 §2.5), con la clave de un solo uso de 32 bytes.
    pub fn poly1305(clave: &[u8; 32], msg: &[u8]) -> [u8; 16] {
        const M: u32 = 0x3ff_ffff;
        let r0 = le32(&clave[0..]) & 0x3ff_ffff;
        let r1 = (le32(&clave[3..]) >> 2) & 0x3ff_ff03;
        let r2 = (le32(&clave[6..]) >> 4) & 0x3ff_c0ff;
        let r3 = (le32(&clave[9..]) >> 6) & 0x3f0_3fff;
        let r4 = (le32(&clave[12..]) >> 8) & 0x00f_ffff;
        let (s1, s2, s3, s4) = (r1 * 5, r2 * 5, r3 * 5, r4 * 5);
        let (mut h0, mut h1, mut h2, mut h3, mut h4) = (0u32, 0u32, 0u32, 0u32, 0u32);

        for trozo in msg.chunks(16) {
            // Un bloque entero lleva el bit 128 en 1; uno corto, un 1 justo
            // después de sus bytes y ceros hasta el final.
            let mut b = [0u8; 17];
            b[..trozo.len()].copy_from_slice(trozo);
            b[trozo.len()] = 1;
            h0 += le32(&b[0..]) & M;
            h1 += (le32(&b[3..]) >> 2) & M;
            h2 += (le32(&b[6..]) >> 4) & M;
            h3 += (le32(&b[9..]) >> 6) & M;
            h4 += (le32(&b[12..]) >> 8) | (u32::from(b[16]) << 24);

            let m = |a: u32, b: u32| u64::from(a) * u64::from(b);
            let d0 = m(h0, r0) + m(h1, s4) + m(h2, s3) + m(h3, s2) + m(h4, s1);
            let mut d1 = m(h0, r1) + m(h1, r0) + m(h2, s4) + m(h3, s3) + m(h4, s2);
            let mut d2 = m(h0, r2) + m(h1, r1) + m(h2, r0) + m(h3, s4) + m(h4, s3);
            let mut d3 = m(h0, r3) + m(h1, r2) + m(h2, r1) + m(h3, r0) + m(h4, s4);
            let mut d4 = m(h0, r4) + m(h1, r3) + m(h2, r2) + m(h3, r1) + m(h4, r0);

            let mut c = (d0 >> 26) as u32;
            h0 = d0 as u32 & M;
            d1 += u64::from(c);
            c = (d1 >> 26) as u32;
            h1 = d1 as u32 & M;
            d2 += u64::from(c);
            c = (d2 >> 26) as u32;
            h2 = d2 as u32 & M;
            d3 += u64::from(c);
            c = (d3 >> 26) as u32;
            h3 = d3 as u32 & M;
            d4 += u64::from(c);
            c = (d4 >> 26) as u32;
            h4 = d4 as u32 & M;
            h0 += c * 5;
            c = h0 >> 26;
            h0 &= M;
            h1 += c;
        }

        // Acarreo completo y reducción módulo 2^130 - 5.
        let mut c = h1 >> 26;
        h1 &= M;
        h2 += c;
        c = h2 >> 26;
        h2 &= M;
        h3 += c;
        c = h3 >> 26;
        h3 &= M;
        h4 += c;
        c = h4 >> 26;
        h4 &= M;
        h0 += c * 5;
        c = h0 >> 26;
        h0 &= M;
        h1 += c;

        let mut g0 = h0.wrapping_add(5);
        c = g0 >> 26;
        g0 &= M;
        let mut g1 = h1.wrapping_add(c);
        c = g1 >> 26;
        g1 &= M;
        let mut g2 = h2.wrapping_add(c);
        c = g2 >> 26;
        g2 &= M;
        let mut g3 = h3.wrapping_add(c);
        c = g3 >> 26;
        g3 &= M;
        let g4 = h4.wrapping_add(c).wrapping_sub(1 << 26);

        // h si h < p, g = h - p si no: elegido con una máscara, sin ramas.
        let mascara = (g4 >> 31).wrapping_sub(1);
        let h0 = (h0 & !mascara) | (g0 & mascara);
        let h1 = (h1 & !mascara) | (g1 & mascara);
        let h2 = (h2 & !mascara) | (g2 & mascara);
        let h3 = (h3 & !mascara) | (g3 & mascara);
        let h4 = (h4 & !mascara) | (g4 & mascara);

        let w0 = h0 | (h1 << 26);
        let w1 = (h1 >> 6) | (h2 << 20);
        let w2 = (h2 >> 12) | (h3 << 14);
        let w3 = (h3 >> 18) | (h4 << 8);

        let mut f = u64::from(w0) + u64::from(le32(&clave[16..]));
        let t0 = f as u32;
        f = u64::from(w1) + u64::from(le32(&clave[20..])) + (f >> 32);
        let t1 = f as u32;
        f = u64::from(w2) + u64::from(le32(&clave[24..])) + (f >> 32);
        let t2 = f as u32;
        f = u64::from(w3) + u64::from(le32(&clave[28..])) + (f >> 32);
        let t3 = f as u32;

        let mut out = [0u8; 16];
        for (i, t) in [t0, t1, t2, t3].into_iter().enumerate() {
            out[4 * i..4 * i + 4].copy_from_slice(&t.to_le_bytes());
        }
        out
    }

    /// Lo que autentica Poly1305 en el AEAD (RFC 8439 §2.8): los datos
    /// asociados, el cifrado, cada uno rellenado a 16, y los dos largos.
    fn etiqueta(clave: &[u8; 32], nonce: &[u8; 12], aad: &[u8], c: &[u8]) -> [u8; 16] {
        let bloque0 = bloque(clave, 0, nonce);
        let otk: [u8; 32] = bloque0[..32].try_into().expect("32 bytes");
        let relleno = |n: usize| (16 - n % 16) % 16;
        let mut mac = Vec::with_capacity(aad.len() + c.len() + 48);
        mac.extend_from_slice(aad);
        mac.resize(mac.len() + relleno(aad.len()), 0);
        mac.extend_from_slice(c);
        mac.resize(mac.len() + relleno(c.len()), 0);
        mac.extend_from_slice(&(aad.len() as u64).to_le_bytes());
        mac.extend_from_slice(&(c.len() as u64).to_le_bytes());
        poly1305(&otk, &mac)
    }

    pub fn sellar(clave: &[u8; 32], nonce: &[u8; 12], aad: &[u8], m: &[u8]) -> (Vec<u8>, [u8; 16]) {
        let mut c = m.to_vec();
        xor(clave, 1, nonce, &mut c);
        let t = etiqueta(clave, nonce, aad, &c);
        (c, t)
    }

    pub fn abrir(
        clave: &[u8; 32],
        nonce: &[u8; 12],
        aad: &[u8],
        c: &[u8],
        t: &[u8; 16],
    ) -> Option<Vec<u8>> {
        let esperada = etiqueta(clave, nonce, aad, c);
        // En tiempo constante: se recorren los 16 bytes siempre.
        let distinto = esperada.iter().zip(t).fold(0u8, |a, (x, y)| a | (x ^ y));
        if distinto != 0 {
            return None;
        }
        let mut m = c.to_vec();
        xor(clave, 1, nonce, &mut m);
        Some(m)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn hex(s: &str) -> Vec<u8> {
        let s: String = s.split_whitespace().collect();
        (0..s.len())
            .step_by(2)
            .map(|i| u8::from_str_radix(&s[i..i + 2], 16).unwrap())
            .collect()
    }

    /// RFC 8439 §2.4.2: el ejemplo de cifrado de ChaCha20.
    #[test]
    fn chacha20_del_rfc() {
        let clave: [u8; 32] =
            hex("000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f")
                .try_into()
                .unwrap();
        let nonce: [u8; 12] = hex("000000000000004a00000000").try_into().unwrap();
        let mut m = b"Ladies and Gentlemen of the class of '99: If I could offer you only one tip for the future, sunscreen would be it.".to_vec();
        chacha::xor(&clave, 1, &nonce, &mut m);
        assert_eq!(
            m,
            hex(
                "6e2e359a2568f98041ba0728dd0d6981e97e7aec1d4360c20a27afccfd9fae0b
                 f91b65c5524733ab8f593dabcd62b3571639d624e65152ab8f530c359f0861d8
                 07ca0dbf500d6a6156a38e088a22b65e52bc514d16ccf806818ce91ab7793736
                 5af90bbf74a35be6b40b8eedf2785e42874d"
            )
        );
    }

    /// RFC 8439 §2.5.2: el ejemplo de Poly1305.
    #[test]
    fn poly1305_del_rfc() {
        let clave: [u8; 32] =
            hex("85d6be7857556d337f4452fe42d506a80103808afb0db2fd4abff6af4149f51b")
                .try_into()
                .unwrap();
        let t = chacha::poly1305(&clave, b"Cryptographic Forum Research Group");
        assert_eq!(t.to_vec(), hex("a8061dc1305136c6c22b8baf0c0127a9"));
    }

    /// Poly1305 en los bordes de la reducción: el acumulador en `p` y por
    /// encima, que es donde se equivoca una implementación (RFC 8439 A.3,
    /// vectores 6 y 11).
    #[test]
    fn poly1305_en_los_bordes() {
        let mut clave = [0u8; 32];
        clave[0] = 2;
        let m = hex("ffffffffffffffffffffffffffffffff");
        assert_eq!(
            chacha::poly1305(&clave, &m).to_vec(),
            hex("03000000000000000000000000000000")
        );
        let mut clave = [0u8; 32];
        clave[0] = 1;
        let m = hex(
            "ffffffffffffffffffffffffffffffff fbfefefefefefefefefefefefefefefe
             01010101010101010101010101010101",
        );
        assert_eq!(
            chacha::poly1305(&clave, &m).to_vec(),
            hex("00000000000000000000000000000000")
        );
    }

    /// RFC 8439 §2.8.2: el ejemplo del AEAD entero, por los dos caminos.
    #[test]
    fn aead_del_rfc() {
        let clave: [u8; 32] =
            hex("808182838485868788898a8b8c8d8e8f909192939495969798999a9b9c9d9e9f")
                .try_into()
                .unwrap();
        let nonce: [u8; 12] = hex("070000004041424344454647").try_into().unwrap();
        let aad = hex("50515253c0c1c2c3c4c5c6c7");
        let m = b"Ladies and Gentlemen of the class of '99: If I could offer you only one tip for the future, sunscreen would be it.";
        let c_esperado = hex(
            "d31a8d34648e60db7b86afbc53ef7ec2a4aded51296e08fea9e2b5a736ee62d6
             3dbea45e8ca9671282fafb69da92728b1a71de0a9e060b2905d6a5b67ecd3b36
             92ddbd7f2d778b8c9803aee328091b58fab324e4fad675945585808b4831d7bc
             3ff4def08e4b7a9de576d26586cec64b6116",
        );
        let t_esperada = hex("1ae10b594f09e26a7e902ecbd0600691");

        let (c, t) = chacha::sellar(&clave, &nonce, &aad, m);
        assert_eq!(c, c_esperado);
        assert_eq!(t.to_vec(), t_esperada);

        let sellado = sellar_con_nonce(&clave, &nonce, &aad, m).unwrap();
        assert_eq!(&sellado[..4], MARCA);
        assert_eq!(&sellado[16..32], t_esperada.as_slice());
        assert_eq!(&sellado[32..], c_esperado.as_slice());
        assert_eq!(abrir(&clave, &aad, &sellado).unwrap(), m.to_vec());
    }

    /// Lo que no se abre: otra clave, otro nombre, cualquier byte cambiado,
    /// algo cortado, algo sin sellar.
    #[test]
    fn no_abre_lo_que_no_debe() {
        let clave = [7u8; 32];
        let sellado = sellar(&clave, b"winsibot:auth:creds.cbor", b"{\"noiseKey\":1}").unwrap();
        assert_eq!(
            abrir(&clave, b"winsibot:auth:creds.cbor", &sellado).unwrap(),
            b"{\"noiseKey\":1}"
        );
        assert_eq!(
            abrir(&[8u8; 32], b"winsibot:auth:creds.cbor", &sellado),
            Err(ErrorSello::NoCoincide)
        );
        assert_eq!(
            abrir(&clave, b"winsibot:auth:pre-key-1.cbor", &sellado),
            Err(ErrorSello::NoCoincide)
        );
        for i in 4..sellado.len() {
            let mut mal = sellado.clone();
            mal[i] ^= 1;
            assert_eq!(
                abrir(&clave, b"winsibot:auth:creds.cbor", &mal),
                Err(ErrorSello::NoCoincide),
                "byte {i}"
            );
        }
        assert_eq!(
            abrir(&clave, b"x", &sellado[..sellado.len() - 1]),
            Err(ErrorSello::NoCoincide)
        );
        assert_eq!(abrir(&clave, b"x", &sellado[..32]), Err(ErrorSello::Largo));
        assert_eq!(
            abrir(&clave, b"x", b"{\"a\":1}"),
            Err(ErrorSello::NoSellado)
        );
        assert_eq!(sellar(&clave, b"x", b""), Err(ErrorSello::Largo));
        assert_eq!(sellar(&clave, b"", b"a"), Err(ErrorSello::Largo));
        assert_eq!(
            sellar(&clave, &[1u8; MAX_AAD + 1], b"a"),
            Err(ErrorSello::Largo)
        );
        assert_eq!(
            sellar(&clave, b"x", &vec![0u8; MAX_DATOS + 1]),
            Err(ErrorSello::Largo)
        );
    }

    /// Dos sellos del mismo texto no se parecen: el nonce es distinto cada vez.
    #[test]
    fn el_nonce_cambia() {
        let clave = [1u8; 32];
        let a = sellar(&clave, b"x", b"hola").unwrap();
        let b = sellar(&clave, b"x", b"hola").unwrap();
        assert_ne!(a[4..16], b[4..16]);
        assert_ne!(a[32..], b[32..]);
    }

    /// Los casos que comprueba el bot (`scripts/authSeal.test.js`): con un nonce
    /// fijo, Node tiene que sellar exactamente estos bytes y abrirlos. Como acá
    /// sella SPARKNaCl con la feature `ada` y la copia en Rust sin ella, y el
    /// test de arriba las compara, son los tres iguales.
    #[test]
    fn vectores_para_el_bot() {
        let mut casos = Vec::new();
        let textos: [&[u8]; 6] = [
            b"a",
            b"{\"noiseKey\":{\"private\":\"x\"}}",
            &[0u8; 16],
            &[0xffu8; 64],
            &[7u8; 65],
            b"Ladies and Gentlemen of the class of '99: If I could offer you only one tip for the future, sunscreen would be it.",
        ];
        for (i, m) in textos.iter().enumerate() {
            let clave: [u8; 32] = std::array::from_fn(|j| (i * 31 + j * 7) as u8);
            let nonce: [u8; 12] = std::array::from_fn(|j| (i * 13 + j) as u8);
            let aad = format!("winsibot:auth:caso-{i}.cbor");
            let s = sellar_con_nonce(&clave, &nonce, aad.as_bytes(), m).unwrap();
            casos.push(serde_json::json!({
                "clave": hexa(&clave),
                "nonce": hexa(&nonce),
                "aad": aad,
                "texto": hexa(m),
                "sellado": hexa(&s),
            }));
        }
        let v = serde_json::json!({ "casos": casos });
        let ruta = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../../scripts/auth_seal.vectors.json");
        let nuevo = serde_json::to_string_pretty(&v).unwrap() + "\n";
        if std::env::var("WINSI_ESCRIBIR_VECTORES").is_ok() {
            std::fs::write(&ruta, &nuevo).unwrap();
        }
        let actual = std::fs::read_to_string(&ruta)
            .unwrap_or_default()
            .replace("\r\n", "\n");
        assert_eq!(actual, nuevo, "correr con WINSI_ESCRIBIR_VECTORES=1");
    }

    fn hexa(b: &[u8]) -> String {
        b.iter().map(|x| format!("{x:02x}")).collect()
    }

    /// Con la feature `ada` sella SPARKNaCl: tiene que dar exactamente lo mismo
    /// que la copia en Rust, en largos de 1 a 300 (los bordes de los bloques de
    /// 16 y de 64) y en textos al azar de hasta 70 KB, por los dos lados.
    #[cfg(winsi_ada)]
    #[test]
    fn sparknacl_da_lo_mismo_que_la_copia_en_rust() {
        let mut estado = 0x9e37_79b9_7f4a_7c15u64;
        let mut azar = |n: usize| -> Vec<u8> {
            (0..n)
                .map(|_| {
                    estado ^= estado << 13;
                    estado ^= estado >> 7;
                    estado ^= estado << 17;
                    estado as u8
                })
                .collect()
        };
        let mut largos: Vec<usize> = (1..=300).collect();
        largos.extend([1023, 1024, 1025, 4096, 65_535, 70_000]);
        for (i, &n) in largos.iter().enumerate() {
            let clave: [u8; 32] = azar(32).try_into().unwrap();
            let nonce: [u8; 12] = azar(12).try_into().unwrap();
            let aad = azar(1 + i % MAX_AAD);
            let m = azar(n);
            let (c_ada, t_ada) = aead_sellar(&clave, &nonce, &aad, &m).unwrap();
            let (c_rust, t_rust) = chacha::sellar(&clave, &nonce, &aad, &m);
            assert_eq!(c_ada, c_rust, "largo {n}");
            assert_eq!(t_ada, t_rust, "largo {n}");
            assert_eq!(
                aead_abrir(&clave, &nonce, &aad, &c_rust, &t_rust).unwrap(),
                m
            );
            let mut mal = t_rust;
            mal[i % 16] ^= 0x80;
            assert_eq!(
                aead_abrir(&clave, &nonce, &aad, &c_rust, &mal),
                Err(ErrorSello::NoCoincide)
            );
        }
        // El texto más largo que acepta Ada.
        let clave = [3u8; 32];
        let m = azar(MAX_DATOS);
        let s = sellar_con_nonce(&clave, &[0u8; 12], b"tope", &m).unwrap();
        let (c, t) = chacha::sellar(&clave, &[0u8; 12], b"tope", &m);
        assert_eq!(&s[32..], c.as_slice());
        assert_eq!(&s[16..32], t.as_slice());
    }
}
