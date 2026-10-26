//! jpeg.rs — codificar la salida de los comandos de imagen en JPEG.
//!
//! Lo que el bot manda, WhatsApp lo recomprime a JPEG. Mandar PNG es pagar dos
//! veces: CPU para comprimir algo que después se tira, y una subida 6 veces
//! más grande (1668 contra 263 KB en una imagen de 1536x1024, medido con
//! `profile_image`), que en un teléfono es batería y datos.
//!
//! El codificador JPEG del crate `image` es lento —el doble que su PNG—, así
//! que con la feature `native` se usa uno propio, partido por la forma del
//! trabajo:
//!
//! - **Zig** (`native/jpeg.zig`): color, submuestreo 4:2:0 y DCT con vectores
//!   de 8 lanes; aritmética uniforme sobre cada bloque de 8x8.
//! - **C** (`native/jpeg.c`): tablas, cabeceras y Huffman; decisiones bit a
//!   bit, sin nada que vectorizar.
//!
//! Sin la feature, el del crate `image`. Los dos producen JPEG de base estándar.

use image::RgbImage;

/// La calidad por defecto: la misma escala que libjpeg. 90 deja la imagen
/// visualmente igual y WhatsApp igual la recomprime después.
pub const CALIDAD: u8 = 90;

#[cfg(feature = "native")]
mod ffi {
    unsafe extern "C" {
        pub fn winsi_jpeg_tables(calidad: i32, qy: *mut u8, qc: *mut u8);
        pub fn winsi_jpeg_scratch_len(w: u32) -> usize;
        #[cfg(winsi_v3)]
        pub fn winsi_jpeg_scratch_len_v3(w: u32) -> usize;
        pub fn winsi_jpeg_coefs(
            rgb: *const u8,
            w: u32,
            h: u32,
            qy: *const u8,
            qc: *const u8,
            out: *mut i16,
            scratch: *mut f32,
            my0: u32,
            my1: u32,
            canales: u32,
        );
        #[cfg(winsi_v3)]
        pub fn winsi_jpeg_coefs_v3(
            rgb: *const u8,
            w: u32,
            h: u32,
            qy: *const u8,
            qc: *const u8,
            out: *mut i16,
            scratch: *mut f32,
            my0: u32,
            my1: u32,
            canales: u32,
        );
        pub fn winsi_jpeg_init();
        pub fn winsi_jpeg_cabecera(
            w: u32,
            h: u32,
            qy: *const u8,
            qc: *const u8,
            reinicio: u32,
            out: *mut u8,
            cap: usize,
        ) -> usize;
        pub fn winsi_jpeg_franja(coefs: *const i16, m0: u32, m1: u32, out: *mut u8, cap: usize) -> usize;
    }
}

/// Las tablas de Huffman, una vez por proceso y antes de cualquier franja (ver
/// winsi_jpeg_init en native/jpeg.c).
#[cfg(feature = "native")]
fn iniciar() {
    static UNA: std::sync::Once = std::sync::Once::new();
    // SAFETY: arma tablas estáticas; Once garantiza que corre una sola vez y
    // que termina antes de que cualquier otro hilo pase de acá.
    UNA.call_once(|| unsafe { ffi::winsi_jpeg_init() });
}

/// Los bytes de un tramo de MCU [m0, m1), reintentando con más espacio si el
/// primero no alcanza (ruido puro a calidad 100 puede pasar del tamaño crudo).
#[cfg(feature = "native")]
fn franja(coefs: &[i16], m0: u32, m1: u32, cap_inicial: usize) -> Option<Vec<u8>> {
    let mut cap = cap_inicial;
    for _ in 0..3 {
        let mut out = vec![0u8; cap];
        // SAFETY: `coefs` tiene 6·64 por MCU y m1 no pasa del total; `out`
        // mide `cap` y el escritor no pasa de ahí (devuelve 0 si no alcanza).
        let n = unsafe { ffi::winsi_jpeg_franja(coefs.as_ptr(), m0, m1, out.as_mut_ptr(), cap) };
        if n > 0 {
            out.truncate(n);
            return Some(out);
        }
        cap *= 2;
    }
    None
}

/// Los datos comprimidos de la imagen entera, en tramos de filas de MCU
/// codificados en paralelo y unidos con marcadores RSTn. Devuelve el intervalo
/// de reinicio que hay que anotar en la cabecera (0: un solo tramo) y los bytes.
#[cfg(feature = "native")]
fn entropia(coefs: &[i16], w: u32, h: u32, hilos: usize) -> Option<(u32, Vec<u8>)> {
    let (cols, filas) = (w.div_ceil(16), h.div_ceil(16));
    let n = (hilos as u32).min(filas).max(1);
    // Filas de MCU por tramo. El intervalo de reinicio va en 16 bits.
    let mut k = filas.div_ceil(n);
    if k * cols > 65_535 {
        k = (65_535 / cols).max(1);
    }
    let tramos = filas.div_ceil(k);
    let cap = |filas_tramo: u32| (filas_tramo as usize * 16 * w as usize * 3) / 2 + 1024;
    if tramos <= 1 {
        return franja(coefs, 0, cols * filas, cap(filas)).map(|d| (0, d));
    }
    let partes: Vec<Option<Vec<u8>>> = std::thread::scope(|s| {
        let hilos: Vec<_> = (0..tramos)
            .map(|t| {
                let (f0, f1) = (t * k, ((t + 1) * k).min(filas));
                s.spawn(move || franja(coefs, f0 * cols, f1 * cols, cap(f1 - f0)))
            })
            .collect();
        hilos.into_iter().map(|h| h.join().unwrap_or(None)).collect()
    });
    let mut datos = Vec::with_capacity(partes.iter().flatten().map(Vec::len).sum::<usize>() + 2 * tramos as usize);
    for (i, p) in partes.into_iter().enumerate() {
        if i > 0 {
            // RST0..RST7, en rueda: entre un tramo y el siguiente.
            datos.extend_from_slice(&[0xFF, 0xD0 + ((i - 1) % 8) as u8]);
        }
        datos.extend_from_slice(&p?);
    }
    Some((k * cols, datos))
}

/// JPEG con el códec propio en C y Zig.
#[cfg(feature = "native")]
pub fn codificar_nativo(img: &RgbImage, calidad: u8) -> Vec<u8> {
    codificar_nativo_con(img, calidad, crate::anime4k::hilos())
}

/// Como [`codificar_nativo`], con el Huffman repartido en `hilos` tramos.
#[cfg(feature = "native")]
pub fn codificar_nativo_con(img: &RgbImage, calidad: u8, hilos: usize) -> Vec<u8> {
    let (w, h) = (img.width(), img.height());
    if w == 0 || h == 0 || w > 65_535 || h > 65_535 {
        // JPEG guarda las dimensiones en 16 bits; lo raro va por el otro.
        return codificar_image(img, calidad);
    }
    coefs_y_armar(img.as_raw(), 3, w, h, calidad, hilos).unwrap_or_else(|| codificar_image(img, calidad))
}

/// Un JPEG de una imagen RGBA, ignorando el alfa, sin copiarla antes a RGB.
///
/// Es lo que hace el #upscale: Anime4K trabaja en RGBA (usa el alfa de
/// borrador) y antes la imagen se pasaba entera a RGB —8 ms y 19 MB más sobre
/// 3072x2048— solo para que el codificador la leyera. El kernel de color lee
/// de a 4 bytes y salta el alfa; el resultado es el mismo bit a bit.
pub fn codificar_rgba(img: &image::RgbaImage, calidad: u8) -> Vec<u8> {
    #[cfg(feature = "native")]
    {
        let (w, h) = (img.width(), img.height());
        if std::env::var("WINSI_JPEG").as_deref() != Ok("image") && w > 0 && h > 0 && w <= 65_535 && h <= 65_535 {
            if let Some(jpg) = coefs_y_armar(img.as_raw(), 4, w, h, calidad, crate::anime4k::hilos()) {
                return jpg;
            }
        }
    }
    codificar(&crate::anime4k::sin_alfa(img), calidad)
}

/// Color, DCT y Huffman de `px` (`canales` bytes por píxel). None si el
/// escritor se quedó sin lugar, cosa que no debería pasar.
#[cfg(feature = "native")]
fn coefs_y_armar(px: &[u8], canales: u32, w: u32, h: u32, calidad: u8, hilos: usize) -> Option<Vec<u8>> {
    debug_assert_eq!(px.len(), w as usize * h as usize * canales as usize);
    let mut qy = [0u8; 64];
    let mut qc = [0u8; 64];
    let mcus = w.div_ceil(16) as usize * h.div_ceil(16) as usize;
    let mut coefs = vec![0i16; mcus * 6 * 64];
    // SAFETY: las tablas miden 64.
    unsafe { ffi::winsi_jpeg_tables(i32::from(calidad), qy.as_mut_ptr(), qc.as_mut_ptr()) };

    iniciar();
    // Color y DCT en franjas de filas de MCU sobre todos los núcleos: cada
    // MCU es independiente. El Huffman también va en franjas desde la 8.17.0,
    // con marcadores de reinicio (ver `entropia`).
    let filas_mcu = h.div_ceil(16);
    let n = (crate::anime4k::hilos() as u32).min(filas_mcu);
    let paso = filas_mcu.div_ceil(n);
    let (src, dst) = (px.as_ptr() as usize, coefs.as_mut_ptr() as usize);
    let (qyp, qcp) = (qy.as_ptr() as usize, qc.as_ptr() as usize);
    std::thread::scope(|s| {
        for t in 0..n {
            let (my0, my1) = (t * paso, ((t + 1) * paso).min(filas_mcu));
            if my0 >= my1 {
                continue;
            }
            s.spawn(move || {
                // SAFETY: `px` mide w·h·canales; `coefs` mide 6·64 por MCU y cada
                // hilo escribe solo los de sus filas de MCU; el `scratch` es de
                // este hilo y mide lo que pide el propio kernel.
                unsafe {
                    let mut scratch = vec![0f32; crate::zig!(ffi::winsi_jpeg_scratch_len, ffi::winsi_jpeg_scratch_len_v3, w)];
                    crate::zig!(ffi::winsi_jpeg_coefs, ffi::winsi_jpeg_coefs_v3, src as *const u8,
                        w,
                        h,
                        qyp as *const u8,
                        qcp as *const u8,
                        dst as *mut i16,
                        scratch.as_mut_ptr(),
                        my0,
                        my1,
                        canales);
                }
            });
        }
    });
    armar(&coefs, w, h, &qy, &qc, hilos)
}

/// Cabecera + datos + EOI. `hilos` = 1 da un solo tramo, sin marcadores.
#[cfg(feature = "native")]
fn armar(coefs: &[i16], w: u32, h: u32, qy: &[u8; 64], qc: &[u8; 64], hilos: usize) -> Option<Vec<u8>> {
    let (reinicio, datos) = entropia(coefs, w, h, hilos)?;
    let mut jpg = vec![0u8; 1024];
    // SAFETY: las tablas miden 64; `jpg` mide 1024, de sobra para la cabecera
    // (~620 bytes), y el escritor no pasa de ahí.
    let n = unsafe { ffi::winsi_jpeg_cabecera(w, h, qy.as_ptr(), qc.as_ptr(), reinicio, jpg.as_mut_ptr(), jpg.len()) };
    if n == 0 {
        return None;
    }
    jpg.truncate(n);
    jpg.reserve_exact(datos.len() + 2);
    jpg.extend_from_slice(&datos);
    jpg.extend_from_slice(&[0xFF, 0xD9]); // EOI
    Some(jpg)
}

/// JPEG con el codificador del crate `image`.
pub fn codificar_image(img: &RgbImage, calidad: u8) -> Vec<u8> {
    let mut out = Vec::new();
    let enc = image::codecs::jpeg::JpegEncoder::new_with_quality(&mut out, calidad);
    // Escribir a un Vec no falla salvo por memoria.
    let _ = image::ImageEncoder::write_image(
        enc,
        img.as_raw(),
        img.width(),
        img.height(),
        image::ExtendedColorType::Rgb8,
    );
    out
}

/// JPEG con el mejor codificador disponible.
pub fn codificar(img: &RgbImage, calidad: u8) -> Vec<u8> {
    #[cfg(feature = "native")]
    {
        if std::env::var("WINSI_JPEG").as_deref() != Ok("image") {
            return codificar_nativo(img, calidad);
        }
    }
    codificar_image(img, calidad)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[cfg(feature = "native")]
    #[test]
    fn desde_rgba_sale_el_mismo_jpeg_que_desde_rgb() {
        // Anchos que no son múltiplo de 8 ni de 16, para pasar por la cola y
        // el relleno del kernel de color.
        for &(w, h) in &[(1, 1), (7, 3), (16, 16), (37, 21), (130, 70), (301, 155)] {
            let rgb = imagen(w, h);
            // El alfa con basura a propósito: el JPEG no tiene que mirarlo.
            let rgba = image::RgbaImage::from_fn(w, h, |x, y| {
                let p = rgb.get_pixel(x, y);
                image::Rgba([p[0], p[1], p[2], (x * 7 + y * 13) as u8])
            });
            assert_eq!(codificar_rgba(&rgba, CALIDAD), codificar(&rgb, CALIDAD), "{w}x{h}");
        }
    }

    /// Una imagen con de todo: degradados suaves, un borde duro y ruido.
    fn imagen(w: u32, h: u32) -> RgbImage {
        let mut s: u32 = 0x1234_5678;
        RgbImage::from_fn(w, h, |x, y| {
            s ^= s << 13;
            s ^= s >> 17;
            s ^= s << 5;
            let ruido = (s & 15) as u8;
            if x > w / 2 && y > h / 3 {
                image::Rgb([200, 30u8.wrapping_add(ruido), 40])
            } else {
                image::Rgb([
                    (x * 255 / w.max(1)) as u8,
                    (y * 255 / h.max(1)) as u8,
                    128 + ruido,
                ])
            }
        })
    }

    /// PSNR en dB entre dos imágenes del mismo tamaño: la medida estándar de
    /// cuánto se parece una compresión al original. Arriba de 30 dB es
    /// "visualmente bueno"; los JPEG de calidad 90 suelen dar 35-45.
    fn psnr(a: &RgbImage, b: &RgbImage) -> f64 {
        let mse: f64 = a
            .as_raw()
            .iter()
            .zip(b.as_raw())
            .map(|(&x, &y)| (f64::from(x) - f64::from(y)).powi(2))
            .sum::<f64>()
            / a.as_raw().len() as f64;
        if mse == 0.0 {
            return f64::INFINITY;
        }
        10.0 * (255.0f64 * 255.0 / mse).log10()
    }

    fn decodificar(jpeg: &[u8]) -> RgbImage {
        image::load_from_memory_with_format(jpeg, image::ImageFormat::Jpeg)
            .expect("el JPEG tiene que poder decodificarse")
            .to_rgb8()
    }

    #[test]
    fn el_del_crate_image_sirve_de_referencia() {
        let img = imagen(64, 48);
        let dec = decodificar(&codificar_image(&img, 90));
        assert!(psnr(&img, &dec) > 30.0);
    }

    /// PSNR de la luma sola: lo único comparable con el crate `image`, que
    /// no submuestrea el color (4:4:4 —su doc dice 4:2:2, el código pone 1x1
    /// en los tres componentes—) mientras que este usa 4:2:0, como libjpeg por
    /// defecto y como WhatsApp al recomprimir.
    #[cfg(feature = "native")]
    fn psnr_luma(a: &RgbImage, b: &RgbImage) -> f64 {
        // Con los pesos BT.601, los de JPEG. `to_luma8()` usa BT.709, y con
        // pesos distintos el error del color submuestreado se cuela en la luma
        // calculada: se estaría comparando color, no luma.
        let l = |i: &RgbImage| -> Vec<f64> {
            i.pixels()
                .map(|p| {
                    0.299 * f64::from(p[0]) + 0.587 * f64::from(p[1]) + 0.114 * f64::from(p[2])
                })
                .collect()
        };
        let (la, lb) = (l(a), l(b));
        let mse: f64 = la
            .iter()
            .zip(&lb)
            .map(|(&x, &y)| (x - y).powi(2))
            .sum::<f64>()
            / la.len() as f64;
        if mse == 0.0 {
            return f64::INFINITY;
        }
        10.0 * (255.0f64 * 255.0 / mse).log10()
    }

    #[cfg(feature = "native")]
    #[test]
    fn el_nativo_produce_un_jpeg_valido_y_fiel() {
        // Tamaños que no son múltiplos de 16: el relleno de bordes, las MCU
        // incompletas y el caso de un solo píxel.
        for &(w, h) in &[
            (1, 1),
            (7, 5),
            (16, 16),
            (17, 9),
            (33, 65),
            (200, 131),
            (640, 480),
        ] {
            let img = imagen(w, h);
            let jpg = codificar_nativo(&img, 90);
            assert_eq!(&jpg[..2], &[0xFF, 0xD8], "{w}x{h}: falta SOI");
            assert_eq!(&jpg[jpg.len() - 2..], &[0xFF, 0xD9], "{w}x{h}: falta EOI");
            let dec = decodificar(&jpg);
            assert_eq!((dec.width(), dec.height()), (w, h), "{w}x{h}: dimensiones");
            // La luma, igual de fiel que la del crate `image` (medido: entre
            // -0,1 y +0,3 dB en todos estos tamaños).
            let p = psnr_luma(&img, &dec);
            let p_ref = psnr_luma(&img, &decodificar(&codificar_image(&img, 90)));
            assert!(
                p.is_infinite() || p > p_ref - 0.5,
                "{w}x{h}: luma {p:.1} dB contra {p_ref:.1} del crate image"
            );
            // Y la imagen entera, buena en tamaños de verdad.
            if w * h >= 200 * 131 {
                let total = psnr(&img, &dec);
                assert!(total > 33.0, "{w}x{h}: PSNR {total:.1} dB");
            }
        }
    }

    #[cfg(feature = "native")]
    #[test]
    fn los_tramos_en_paralelo_dan_exactamente_los_mismos_pixeles() {
        // Los marcadores de reinicio cambian cómo se empaquetan los bits, no
        // la imagen: decodificada, tiene que dar lo mismo que en un solo tramo.
        for &(w, h) in &[(16, 16), (17, 33), (200, 131), (640, 480), (1000, 70), (33, 1000)] {
            let img = imagen(w, h);
            let uno = codificar_nativo_con(&img, 90, 1);
            assert!(!uno.windows(2).any(|v| v == [0xFF, 0xDD]), "{w}x{h}: un tramo no lleva DRI");
            let ref_px = decodificar(&uno);
            for hilos in [2, 3, 8, 13] {
                let jpg = codificar_nativo_con(&img, 90, hilos);
                assert_eq!(decodificar(&jpg), ref_px, "{w}x{h} con {hilos} tramos");
                assert_eq!(&jpg[jpg.len() - 2..], &[0xFF, 0xD9], "{w}x{h}: falta EOI");
                // Lo que cuestan los marcadores: unos pocos bytes por tramo.
                assert!(jpg.len() <= uno.len() + 64 * hilos, "{w}x{h}: {} contra {}", jpg.len(), uno.len());
            }
        }
    }

    #[cfg(feature = "native")]
    #[test]
    fn el_reinicio_cabe_en_16_bits_con_imagenes_anchas() {
        // 4096 MCU por fila: el tramo no puede pasar de 65535 MCU.
        let img = imagen(65_535, 20);
        let jpg = codificar_nativo_con(&img, 50, 8);
        assert_eq!(decodificar(&jpg).dimensions(), (65_535, 20));
    }

    #[cfg(feature = "native")]
    #[test]
    fn la_calidad_cambia_el_tamano_en_el_sentido_correcto() {
        let img = imagen(320, 240);
        let bajo = codificar_nativo(&img, 30).len();
        let alto = codificar_nativo(&img, 95).len();
        assert!(bajo < alto, "calidad 30 dio {bajo} bytes y 95 dio {alto}");
        let p30 = psnr(&img, &decodificar(&codificar_nativo(&img, 30)));
        let p95 = psnr(&img, &decodificar(&codificar_nativo(&img, 95)));
        assert!(p30 < p95);
    }

    #[cfg(feature = "native")]
    #[test]
    fn el_ruido_puro_a_calidad_100_no_rompe_el_tamano_del_bufer() {
        let mut s: u32 = 7;
        let img = RgbImage::from_fn(97, 61, |_, _| {
            s ^= s << 13;
            s ^= s >> 17;
            s ^= s << 5;
            image::Rgb([s as u8, (s >> 8) as u8, (s >> 16) as u8])
        });
        let dec = decodificar(&codificar_nativo(&img, 100));
        assert_eq!((dec.width(), dec.height()), (97, 61));
    }
}
