//! jpeg.rs — codificar la salida de los comandos de imagen en JPEG.
//!
//! Lo que el bot manda, WhatsApp lo recomprime a JPEG. Mandar PNG es pagar dos
//! veces: CPU para comprimir algo que después se tira, y una subida 6 veces
//! más grande (1668 contra 263 KB en una imagen de 1536x1024, medido con
//! `perfil_imagen`), que en un teléfono es batería y datos.
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
        pub fn winsi_jpeg_coefs(
            rgb: *const u8,
            w: u32,
            h: u32,
            qy: *const u8,
            qc: *const u8,
            out: *mut i16,
            scratch: *mut f32,
        );
        pub fn winsi_jpeg_write(
            coefs: *const i16,
            w: u32,
            h: u32,
            qy: *const u8,
            qc: *const u8,
            out: *mut u8,
            cap: usize,
        ) -> usize;
    }
}

/// JPEG con el códec propio en C y Zig.
#[cfg(feature = "native")]
pub fn codificar_nativo(img: &RgbImage, calidad: u8) -> Vec<u8> {
    let (w, h) = (img.width(), img.height());
    if w == 0 || h == 0 || w > 65_535 || h > 65_535 {
        // JPEG guarda las dimensiones en 16 bits; lo raro va por el otro.
        return codificar_image(img, calidad);
    }
    let mut qy = [0u8; 64];
    let mut qc = [0u8; 64];
    let mcus = w.div_ceil(16) as usize * h.div_ceil(16) as usize;
    let mut coefs = vec![0i16; mcus * 6 * 64];
    // SAFETY: las tablas miden 64; `coefs` mide 6·64 por MCU, que es lo que
    // escribe winsi_jpeg_coefs; `scratch` mide lo que pide el propio kernel;
    // `img` mide w·h·3 bytes por ser un RgbImage.
    unsafe {
        ffi::winsi_jpeg_tables(i32::from(calidad), qy.as_mut_ptr(), qc.as_mut_ptr());
        let mut scratch = vec![0f32; ffi::winsi_jpeg_scratch_len(w)];
        ffi::winsi_jpeg_coefs(
            img.as_ptr(),
            w,
            h,
            qy.as_ptr(),
            qc.as_ptr(),
            coefs.as_mut_ptr(),
            scratch.as_mut_ptr(),
        );
    }
    // Un JPEG casi nunca pasa del tamaño en crudo; si pasa —ruido puro a
    // calidad 100—, se reintenta con el doble.
    let mut cap = (w as usize * h as usize * 3) / 2 + 4096;
    for _ in 0..3 {
        let mut out = vec![0u8; cap];
        // SAFETY: `out` mide `cap`, y el escritor no pasa de ahí: si no le
        // alcanza devuelve 0.
        let n = unsafe {
            ffi::winsi_jpeg_write(
                coefs.as_ptr(),
                w,
                h,
                qy.as_ptr(),
                qc.as_ptr(),
                out.as_mut_ptr(),
                cap,
            )
        };
        if n > 0 {
            out.truncate(n);
            return out;
        }
        cap *= 2;
    }
    codificar_image(img, calidad)
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
