//! anime4k.rs — los kernels de Anime4K, en tres lenguajes.
//!
//! El algoritmo lo explica el comentario de abajo. Lo que este módulo agrega es
//! que cada uno de sus tres kernels por píxel existe en **Rust**, en **C** y,
//! el Sobel, en **Zig** con vectores SIMD, y que se usa el que gane midiendo.
//!
//! - La versión en Rust es la **especificación**: siempre está, y los tests
//!   exigen que C y Zig den lo mismo **bit a bit**.
//! - C y Zig se compilan con Zig —que también es compilador de C— detrás de la
//!   feature `native`. Sin ella el crate compila exactamente como antes, sin
//!   pedir nada instalado.
//! - Qué backend usa cada kernel lo decide [`elegido`], con lo medido en
//!   `benches/anime4k.rs`. `WINSI_A4K=rust|c|zig` lo fuerza, para medir.

use image::RgbaImage;

// ── Anime4K ──────────────────────────────────────────────────────────────────
//
// Portado de `pyanime4k`, que envolvía Anime4KCPP (C++). A diferencia de los
// otros dos, esto NO es una red neuronal: es un algoritmo cerrado de ~5 pasos,
// así que no hay modelo que bajar ni ONNX de por medio — se ejecuta entero acá.
//
// La idea, de bloc97: tratar el color como un mapa de alturas y "empujar" los
// píxeles hacia los bordes probables por ascenso de gradiente. Por eso afina
// las líneas en vez de limitarse a interpolar, que es lo que lo hace bueno para
// dibujo y mediocre para fotos.
//
// Los cinco pasos, por iteración:
//   1. Escalar con bicúbica (acá CatmullRom, que es la bicúbica del crate).
//   2. Luminancia de cada píxel, guardada en el canal alfa.
//   3. pushColor   — afina las líneas siguiendo esa luminancia.
//   4. Gradiente por Sobel sobre la luminancia, invertido, al alfa.
//   5. pushGradient — vuelve a empujar, ahora guiado por el gradiente.
//
// Portado de la implementación de referencia de TianZerL/Anime4KPython, con sus
// mismos valores por defecto: 2 pasadas, fuerza de color 1/3 y de gradiente 1.

/// Cuántas veces se repite el ciclo completo. Más pasadas afinan más las líneas
/// y cuestan proporcionalmente.
pub const A4K_PASADAS: usize = 2;
/// De 0 a 1. Más alto, líneas más finas.
pub const A4K_FUERZA_COLOR: f32 = 1.0 / 3.0;
/// De 0 a 1. Más alto, bordes más marcados.
pub const A4K_FUERZA_GRADIENTE: f32 = 1.0;

/// Techo de píxeles de SALIDA. Un x4 sobre una foto grande son cientos de
/// millones de operaciones y varios cientos de MB; el límite va sobre el
/// resultado, que es lo que de verdad cuesta.
pub const A4K_MAX_PIXELES_SALIDA: u64 = 16_000_000;

/// Luminancia BT.601, la misma constante que usa la referencia.
pub fn luminancia(p: &image::Rgba<u8>) -> u8 {
    let v = 0.299 * f32::from(p[0]) + 0.587 * f32::from(p[1]) + 0.114 * f32::from(p[2]);
    redondear(v)
}

/// Pasa un flotante a u8 redondeando y acotando, como el `unFloat` original.
pub fn redondear(n: f32) -> u8 {
    let n = n + 0.5;
    if n >= 255.0 {
        255
    } else if n <= 0.0 {
        0
    } else {
        n as u8
    }
}

/// Mezcla `mc` hacia el promedio de tres vecinos, con la fuerza dada.
///
/// `alfa_fija` distingue las dos variantes del original: `pushColor` también
/// mezcla el alfa (porque ahí lleva la luminancia y la necesita coherente para
/// el resto de la pasada), mientras que `pushGradient` lo deja en 255 porque ya
/// no se vuelve a usar.
fn empujar(
    mc: &mut [f32; 4],
    a: &image::Rgba<u8>,
    b: &image::Rgba<u8>,
    c: &image::Rgba<u8>,
    fuerza: f32,
    alfa_fija: bool,
) {
    for i in 0..3 {
        let media = (f32::from(a[i]) + f32::from(b[i]) + f32::from(c[i])) / 3.0;
        mc[i] = mc[i] * (1.0 - fuerza) + media * fuerza;
    }
    if alfa_fija {
        mc[3] = 255.0;
    } else {
        let media = (f32::from(a[3]) + f32::from(b[3]) + f32::from(c[3])) / 3.0;
        mc[3] = mc[3] * (1.0 - fuerza) + media * fuerza;
    }
}

/// Los ocho vecinos más el propio píxel, con los bordes replicados.
struct Vecindad {
    tl: image::Rgba<u8>,
    tc: image::Rgba<u8>,
    tr: image::Rgba<u8>,
    ml: image::Rgba<u8>,
    mr: image::Rgba<u8>,
    bl: image::Rgba<u8>,
    bc: image::Rgba<u8>,
    br: image::Rgba<u8>,
}

fn vecindad(img: &image::RgbaImage, x: u32, y: u32) -> Vecindad {
    let (w, h) = (img.width(), img.height());
    // En los bordes se repite la fila o columna propia, igual que el original.
    let xn = if x == 0 { 0 } else { x - 1 };
    let xp = if x == w - 1 { x } else { x + 1 };
    let yn = if y == 0 { 0 } else { y - 1 };
    let yp = if y == h - 1 { y } else { y + 1 };
    let g = |a: u32, b: u32| *img.get_pixel(a, b);
    Vecindad {
        tl: g(xn, yn),
        tc: g(x, yn),
        tr: g(xp, yn),
        ml: g(xn, y),
        mr: g(xp, y),
        bl: g(xn, yp),
        bc: g(x, yp),
        br: g(xp, yp),
    }
}

fn maxi(a: u8, b: u8, c: u8) -> u8 {
    a.max(b).max(c)
}
fn mini(a: u8, b: u8, c: u8) -> u8 {
    a.min(b).min(c)
}

/// Afina las líneas empujando cada píxel hacia el lado más claro.
///
/// Los cuatro bloques (arriba/abajo, subdiagonal, izquierda/derecha, diagonal)
/// se evalúan EN CADENA sobre el mismo `mc`, así que cada uno ve el alfa que
/// dejó el anterior. Es lo que hace el original y cambiarlo altera el
/// resultado, aunque a primera vista parezca un descuido.
pub fn push_color_rust(img: &image::RgbaImage, fuerza: f32) -> image::RgbaImage {
    let mut salida = img.clone();
    for y in 0..img.height() {
        for x in 0..img.width() {
            let v = vecindad(img, x, y);
            let p = img.get_pixel(x, y);
            let mut mc = [
                f32::from(p[0]),
                f32::from(p[1]),
                f32::from(p[2]),
                f32::from(p[3]),
            ];
            let a = |m: &[f32; 4]| redondear(m[3]);

            // arriba y abajo
            if mini(v.tl[3], v.tc[3], v.tr[3]) > a(&mc) && a(&mc) > maxi(v.bl[3], v.bc[3], v.br[3])
            {
                empujar(&mut mc, &v.tl, &v.tc, &v.tr, fuerza, false);
            } else if mini(v.bl[3], v.bc[3], v.br[3]) > a(&mc)
                && a(&mc) > maxi(v.tl[3], v.tc[3], v.tr[3])
            {
                empujar(&mut mc, &v.bl, &v.bc, &v.br, fuerza, false);
            }

            // subdiagonal
            if mini(v.tc[3], v.tr[3], v.mr[3]) > maxi(v.ml[3], a(&mc), v.bc[3]) {
                empujar(&mut mc, &v.tc, &v.tr, &v.mr, fuerza, false);
            } else if mini(v.ml[3], v.bl[3], v.bc[3]) > maxi(v.tc[3], a(&mc), v.mr[3]) {
                empujar(&mut mc, &v.ml, &v.bl, &v.bc, fuerza, false);
            }

            // izquierda y derecha
            if mini(v.tr[3], v.mr[3], v.br[3]) > a(&mc) && a(&mc) > maxi(v.tl[3], v.ml[3], v.bl[3])
            {
                empujar(&mut mc, &v.tr, &v.mr, &v.br, fuerza, false);
            } else if mini(v.tl[3], v.ml[3], v.bl[3]) > a(&mc)
                && a(&mc) > maxi(v.tr[3], v.mr[3], v.br[3])
            {
                empujar(&mut mc, &v.tl, &v.ml, &v.bl, fuerza, false);
            }

            // diagonal
            if mini(v.mr[3], v.br[3], v.bc[3]) > maxi(v.tc[3], a(&mc), v.ml[3]) {
                empujar(&mut mc, &v.mr, &v.br, &v.bc, fuerza, false);
            } else if mini(v.ml[3], v.tl[3], v.tc[3]) > maxi(v.bc[3], a(&mc), v.mr[3]) {
                empujar(&mut mc, &v.ml, &v.tl, &v.tc, fuerza, false);
            }

            salida.put_pixel(
                x,
                y,
                image::Rgba([
                    redondear(mc[0]),
                    redondear(mc[1]),
                    redondear(mc[2]),
                    redondear(mc[3]),
                ]),
            );
        }
    }
    salida
}

/// Sobel sobre la luminancia, invertido y guardado en el alfa.
///
/// Se invierte (`255 - g`) para que `push_gradient` pueda reutilizar la misma
/// comparación que `push_color`: ahí "más claro" significaba más luminancia,
/// acá significa menos borde.
pub fn gradiente_rust(img: &image::RgbaImage) -> image::RgbaImage {
    let mut salida = img.clone();
    let (w, h) = (img.width(), img.height());
    for y in 1..h.saturating_sub(1) {
        for x in 1..w.saturating_sub(1) {
            let a = |dx: i32, dy: i32| {
                f32::from(img.get_pixel((x as i32 + dx) as u32, (y as i32 + dy) as u32)[3])
            };
            let gy = a(-1, 1) + 2.0 * a(0, 1) + a(1, 1) - a(-1, -1) - 2.0 * a(0, -1) - a(1, -1);
            let gx = a(-1, -1) + 2.0 * a(-1, 0) + a(-1, 1) - a(1, -1) - 2.0 * a(1, 0) - a(1, 1);
            let g = (gx * gx + gy * gy).sqrt();
            let mut p = *img.get_pixel(x, y);
            p[3] = 255 - redondear(g);
            salida.put_pixel(x, y, p);
        }
    }
    salida
}

/// Marca los bordes, guiado por el gradiente del paso anterior.
///
/// A diferencia de `push_color`, acá el original SALE en cuanto una dirección
/// coincide, en vez de encadenar las cuatro.
pub fn push_gradient_rust(img: &image::RgbaImage, fuerza: f32) -> image::RgbaImage {
    let mut salida = img.clone();
    for y in 0..img.height() {
        for x in 0..img.width() {
            let v = vecindad(img, x, y);
            let p = img.get_pixel(x, y);
            let mut mc = [
                f32::from(p[0]),
                f32::from(p[1]),
                f32::from(p[2]),
                f32::from(p[3]),
            ];
            let ma = p[3];

            let elegido = if mini(v.tl[3], v.tc[3], v.tr[3]) > ma
                && ma > maxi(v.bl[3], v.bc[3], v.br[3])
            {
                Some((v.tl, v.tc, v.tr))
            } else if mini(v.bl[3], v.bc[3], v.br[3]) > ma && ma > maxi(v.tl[3], v.tc[3], v.tr[3]) {
                Some((v.bl, v.bc, v.br))
            } else if mini(v.tc[3], v.tr[3], v.mr[3]) > maxi(v.ml[3], ma, v.bc[3]) {
                Some((v.tc, v.tr, v.mr))
            } else if mini(v.ml[3], v.bl[3], v.bc[3]) > maxi(v.tc[3], ma, v.mr[3]) {
                Some((v.ml, v.bl, v.bc))
            } else if mini(v.tr[3], v.mr[3], v.br[3]) > ma && ma > maxi(v.tl[3], v.ml[3], v.bl[3]) {
                Some((v.tr, v.mr, v.br))
            } else if mini(v.tl[3], v.ml[3], v.bl[3]) > ma && ma > maxi(v.tr[3], v.mr[3], v.br[3]) {
                Some((v.tl, v.ml, v.bl))
            } else if mini(v.mr[3], v.br[3], v.bc[3]) > maxi(v.tc[3], ma, v.ml[3]) {
                Some((v.mr, v.br, v.bc))
            } else if mini(v.ml[3], v.tl[3], v.tc[3]) > maxi(v.bc[3], ma, v.mr[3]) {
                Some((v.ml, v.tl, v.tc))
            } else {
                None
            };

            match elegido {
                Some((a, b, c)) => empujar(&mut mc, &a, &b, &c, fuerza, true),
                // Sin dirección clara el píxel queda igual, pero el alfa vuelve
                // a 255: si no, los bordes saldrían translúcidos en el PNG.
                None => mc[3] = 255.0,
            }

            salida.put_pixel(
                x,
                y,
                image::Rgba([
                    redondear(mc[0]),
                    redondear(mc[1]),
                    redondear(mc[2]),
                    redondear(mc[3]),
                ]),
            );
        }
    }
    salida
}

// ── Los kernels en C y en Zig ────────────────────────────────────────────────

#[cfg(feature = "native")]
mod ffi {
    unsafe extern "C" {
        pub fn winsi_a4k_push_color_c(
            src: *const u8,
            dst: *mut u8,
            w: u32,
            h: u32,
            f: f32,
            y0: u32,
            y1: u32,
        );
        pub fn winsi_a4k_gradient_c(src: *const u8, dst: *mut u8, w: u32, h: u32, y0: u32, y1: u32);
        pub fn winsi_a4k_push_gradient_c(
            src: *const u8,
            dst: *mut u8,
            w: u32,
            h: u32,
            f: f32,
            y0: u32,
            y1: u32,
        );
        pub fn winsi_a4k_gradient_zig(
            src: *const u8,
            dst: *mut u8,
            w: u32,
            h: u32,
            y0: u32,
            y1: u32,
        );
    }
}

/// Cuántos hilos usan los kernels nativos: todos los núcleos, hasta 8.
///
/// Los tres kernels calculan cada fila de salida mirando solo las vecinas de
/// la entrada, así que una imagen se reparte en franjas sin coordinar nada.
/// Hasta la 8.16.0 corrían en un solo núcleo. Más de 8 no rinde para las
/// imágenes de un chat, y `WINSI_HILOS` lo cambia —1 para medir un núcleo—.
pub fn hilos() -> usize {
    use std::sync::OnceLock;
    static H: OnceLock<usize> = OnceLock::new();
    *H.get_or_init(|| {
        std::env::var("WINSI_HILOS")
            .ok()
            .and_then(|v| v.parse().ok())
            .unwrap_or_else(|| std::thread::available_parallelism().map_or(1, |n| n.get().min(8)))
            .max(1)
    })
}

/// Corre `k(y0, y1)` sobre franjas de filas de `0..h` en `hilos()` hilos.
///
/// Un puntero crudo no es `Send`; se pasa como `usize` porque cada hilo
/// escribe filas DISJUNTAS de la salida y nadie escribe la entrada, que es lo
/// que hace seguro compartirlos.
#[cfg(feature = "native")]
fn en_franjas(h: u32, k: impl Fn(u32, u32) + Sync) {
    let n = (hilos() as u32).min(h.max(1));
    if n <= 1 {
        k(0, h);
        return;
    }
    let paso = h.div_ceil(n);
    std::thread::scope(|s| {
        for i in 0..n {
            let (y0, y1) = (i * paso, ((i + 1) * paso).min(h));
            if y0 >= y1 {
                continue;
            }
            let k = &k;
            s.spawn(move || k(y0, y1));
        }
    });
}

/// `push_color` en C (native/anime4k.c), en franjas sobre todos los núcleos.
#[cfg(feature = "native")]
pub fn push_color_c(img: &RgbaImage, fuerza: f32) -> RgbaImage {
    let (w, h) = (img.width(), img.height());
    let mut salida = RgbaImage::new(w, h);
    let (src, dst) = (img.as_ptr() as usize, salida.as_mut_ptr() as usize);
    // SAFETY: los dos búferes miden w*h*4 —`RgbaImage` lo garantiza— y no se
    // solapan; cada franja escribe solo sus filas de `dst`.
    en_franjas(h, |y0, y1| unsafe {
        ffi::winsi_a4k_push_color_c(src as *const u8, dst as *mut u8, w, h, fuerza, y0, y1)
    });
    salida
}

/// `gradiente` en C (native/anime4k.c), en franjas.
#[cfg(feature = "native")]
pub fn gradiente_c(img: &RgbaImage) -> RgbaImage {
    // Sin clonar: el kernel copia cada fila de su franja (ver anime4k.c).
    let (w, h) = (img.width(), img.height());
    let mut salida = RgbaImage::new(w, h);
    let (src, dst) = (img.as_ptr() as usize, salida.as_mut_ptr() as usize);
    // SAFETY: como arriba.
    en_franjas(h, |y0, y1| unsafe {
        ffi::winsi_a4k_gradient_c(src as *const u8, dst as *mut u8, w, h, y0, y1)
    });
    salida
}

/// `gradiente` en Zig, de a 8 píxeles con `@Vector` (native/anime4k.zig), en
/// franjas.
#[cfg(feature = "native")]
pub fn gradiente_zig(img: &RgbaImage) -> RgbaImage {
    // Sin clonar: el kernel copia cada fila de su franja (ver anime4k.zig).
    let (w, h) = (img.width(), img.height());
    let mut salida = RgbaImage::new(w, h);
    let (src, dst) = (img.as_ptr() as usize, salida.as_mut_ptr() as usize);
    // SAFETY: como arriba.
    en_franjas(h, |y0, y1| unsafe {
        ffi::winsi_a4k_gradient_zig(src as *const u8, dst as *mut u8, w, h, y0, y1)
    });
    salida
}

/// `push_gradient` en C (native/anime4k.c), en franjas.
#[cfg(feature = "native")]
pub fn push_gradient_c(img: &RgbaImage, fuerza: f32) -> RgbaImage {
    let (w, h) = (img.width(), img.height());
    let mut salida = RgbaImage::new(w, h);
    let (src, dst) = (img.as_ptr() as usize, salida.as_mut_ptr() as usize);
    // SAFETY: como arriba.
    en_franjas(h, |y0, y1| unsafe {
        ffi::winsi_a4k_push_gradient_c(src as *const u8, dst as *mut u8, w, h, fuerza, y0, y1)
    });
    salida
}

/// Corre `f` sobre trozos de `datos` de filas enteras (`ancho_fila` bytes),
/// repartidos en `hilos()` hilos. Rust seguro: cada hilo recibe su propio
/// `&mut`, y `chunks_mut` garantiza que no se solapan.
fn por_filas(datos: &mut [u8], ancho_fila: usize, f: impl Fn(&mut [u8]) + Sync) {
    let filas = datos.len() / ancho_fila.max(1);
    let n = hilos().min(filas.max(1));
    if n <= 1 {
        f(datos);
        return;
    }
    let trozo = filas.div_ceil(n) * ancho_fila;
    std::thread::scope(|s| {
        for parte in datos.chunks_mut(trozo) {
            let f = &f;
            s.spawn(move || f(parte));
        }
    });
}

/// La luminancia de cada píxel, al canal alfa, en franjas sobre todos los
/// núcleos. Es el paso 2 de cada pasada de Anime4K, y era de un solo hilo:
/// con los kernels repartidos, era de lo poco que quedaba en serie.
pub fn luminancia_en_alfa(img: &mut RgbaImage) {
    let ancho = img.width() as usize * 4;
    por_filas(&mut *img, ancho, |trozo| {
        for p in trozo.chunks_exact_mut(4) {
            p[3] = luminancia(&image::Rgba([p[0], p[1], p[2], p[3]]));
        }
    });
}

/// La imagen sin el canal alfa, que Anime4K usó de borrador, en franjas.
pub fn sin_alfa(img: &RgbaImage) -> image::RgbImage {
    let (w, h) = img.dimensions();
    let mut rgb = image::RgbImage::new(w, h);
    let src = img.as_raw();
    let ancho = w as usize * 3;
    // Cada trozo de la salida sabe en qué fila empieza por su posición.
    let base = rgb.as_ptr() as usize;
    por_filas(&mut rgb, ancho, |trozo| {
        let fila0 = (trozo.as_ptr() as usize - base) / ancho.max(1);
        for (i, p) in trozo.chunks_exact_mut(3).enumerate() {
            let o = (fila0 * w as usize + i) * 4;
            p.copy_from_slice(&src[o..o + 3]);
        }
    });
    rgb
}

// ── Despacho ─────────────────────────────────────────────────────────────────

/// En qué lenguaje corre un kernel.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Backend {
    Rust,
    C,
    Zig,
}

/// El backend que se usa para cada kernel: (push_color, gradiente, push_gradient).
///
/// Sin la feature `native` es Rust en los tres. Con ella, lo que ganó en
/// `benches/anime4k.rs` (ver el comentario de [`MEDIDO`]). `WINSI_A4K` fuerza
/// uno para los tres, para medir de punta a punta; si el forzado no tiene ese
/// kernel —Zig solo tiene el gradiente— ese kernel cae a Rust.
pub fn elegido() -> (Backend, Backend, Backend) {
    use std::sync::OnceLock;
    static E: OnceLock<(Backend, Backend, Backend)> = OnceLock::new();
    *E.get_or_init(|| {
        if !cfg!(feature = "native") {
            return (Backend::Rust, Backend::Rust, Backend::Rust);
        }
        match std::env::var("WINSI_A4K").ok().as_deref() {
            Some("rust") => (Backend::Rust, Backend::Rust, Backend::Rust),
            Some("c") => (Backend::C, Backend::C, Backend::C),
            Some("zig") => (Backend::Rust, Backend::Zig, Backend::Rust),
            _ => MEDIDO,
        }
    })
}

/// Lo que ganó midiendo, con `benches/anime4k.rs` sobre 1024x768 (mediana de
/// Criterion, x86-64 básico, sin AVX):
///
/// | kernel          | Rust     | C        | Zig      |
/// |-----------------|---------:|---------:|---------:|
/// | `push_color`    | 26,7 ms  | 19,9 ms  | —        |
/// | `gradiente`     | 10,7 ms  |  9,5 ms  |  2,9 ms  |
/// | `push_gradient` | 19,0 ms  | 13,9 ms  | —        |
///
/// Zig gana el Sobel por 3,7x: es el único kernel sin decisiones por píxel, y
/// hace 8 píxeles por instrucción. C gana los otros dos por ~1,35x recorriendo
/// el búfer crudo. Se actualiza con cada medición, no a ojo.
const MEDIDO: (Backend, Backend, Backend) = if cfg!(feature = "native") {
    (Backend::C, Backend::Zig, Backend::C)
} else {
    (Backend::Rust, Backend::Rust, Backend::Rust)
};

pub fn push_color(img: &RgbaImage, fuerza: f32) -> RgbaImage {
    match elegido().0 {
        #[cfg(feature = "native")]
        Backend::C => push_color_c(img, fuerza),
        _ => push_color_rust(img, fuerza),
    }
}

pub fn gradiente(img: &RgbaImage) -> RgbaImage {
    match elegido().1 {
        #[cfg(feature = "native")]
        Backend::C => gradiente_c(img),
        #[cfg(feature = "native")]
        Backend::Zig => gradiente_zig(img),
        _ => gradiente_rust(img),
    }
}

pub fn push_gradient(img: &RgbaImage, fuerza: f32) -> RgbaImage {
    match elegido().2 {
        #[cfg(feature = "native")]
        Backend::C => push_gradient_c(img, fuerza),
        _ => push_gradient_rust(img, fuerza),
    }
}

// ── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    /// Imagen al azar con el alfa ya cargado de luminancia, como la ve el
    /// algoritmo, más algunas zonas planas: las comparaciones `>` estrictas de
    /// los kernels se comportan distinto con vecinos iguales, y al azar puro
    /// casi nunca hay empates.
    pub(super) fn imagen(w: u32, h: u32, semilla: u64) -> RgbaImage {
        let mut s = semilla | 1;
        let mut img = RgbaImage::new(w, h);
        for (x, y, p) in img.enumerate_pixels_mut() {
            s ^= s << 13;
            s ^= s >> 7;
            s ^= s << 17;
            let plano = (x / 7 + y / 5) % 4 == 0;
            let v = if plano {
                [90, 90, 90]
            } else {
                [s as u8, (s >> 8) as u8, (s >> 16) as u8]
            };
            *p = image::Rgba([v[0], v[1], v[2], 0]);
            p[3] = luminancia(p);
        }
        img
    }

    #[cfg(feature = "native")]
    const TAMANOS: [(u32, u32); 7] = [
        (1, 1),
        (2, 2),
        (3, 3),
        (8, 3),
        (17, 9),
        (64, 31),
        (203, 117),
    ];

    #[cfg(feature = "native")]
    #[test]
    fn c_da_lo_mismo_que_rust_bit_a_bit() {
        for (i, &(w, h)) in TAMANOS.iter().enumerate() {
            let img = imagen(w, h, 7 + i as u64);
            assert_eq!(
                push_color_c(&img, A4K_FUERZA_COLOR),
                push_color_rust(&img, A4K_FUERZA_COLOR),
                "push_color {w}x{h}"
            );
            assert_eq!(gradiente_c(&img), gradiente_rust(&img), "gradiente {w}x{h}");
            assert_eq!(
                push_gradient_c(&img, A4K_FUERZA_GRADIENTE),
                push_gradient_rust(&img, A4K_FUERZA_GRADIENTE),
                "push_gradient {w}x{h}"
            );
        }
    }

    #[cfg(feature = "native")]
    #[test]
    fn zig_da_lo_mismo_que_rust_bit_a_bit() {
        // Anchos alrededor de 8 y de 9: el bucle vectorial y la cola escalar,
        // y el caso en que no entra ninguna tanda.
        for (i, &(w, h)) in TAMANOS
            .iter()
            .chain(&[(9, 4), (10, 4), (11, 5), (25, 6)])
            .enumerate()
        {
            let img = imagen(w, h, 99 + i as u64);
            assert_eq!(
                gradiente_zig(&img),
                gradiente_rust(&img),
                "gradiente {w}x{h}"
            );
        }
    }

    #[test]
    fn el_despacho_da_lo_mismo_que_la_referencia() {
        let img = imagen(64, 31, 3);
        assert_eq!(
            push_color(&img, A4K_FUERZA_COLOR),
            push_color_rust(&img, A4K_FUERZA_COLOR)
        );
        assert_eq!(gradiente(&img), gradiente_rust(&img));
        assert_eq!(
            push_gradient(&img, A4K_FUERZA_GRADIENTE),
            push_gradient_rust(&img, A4K_FUERZA_GRADIENTE)
        );
    }
}
