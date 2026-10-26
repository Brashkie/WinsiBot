//! resize.rs — redimensionado bicúbico (Catmull-Rom) para `#upscale`.
//!
//! Con los kernels de Anime4K repartidos en todos los núcleos, el redimensionado
//! del crate `image` quedó siendo el 85% de `#upscale` (`profile_upscale`): un
//! solo hilo, flotantes genéricos, y una imagen intermedia de f32 del ancho
//! original por el alto nuevo —50 MB para un x2 de 1536x1024—.
//!
//! Con la feature `native` se hace en Zig (`native/resize.zig`): pasadas
//! fusionadas fila por fila, @Vector(4, f32) por píxel y franjas en todos los
//! núcleos, y **da lo mismo bit a bit** que el crate, que es lo que comprueban
//! los tests. Los pesos se calculan acá, con la fórmula exacta del crate.
//! Sin la feature, el del crate.

use image::{imageops::FilterType, RgbaImage};

/// `bc_cubic_spline(x, 0, 0.5)` del crate `image` (imageops/sample.rs),
/// copiado tal cual —con sus `powi`— para que los pesos sean idénticos.
fn catmullrom(x: f32) -> f32 {
    let (b, c) = (0.0f32, 0.5f32);
    let a = x.abs();
    let k = if a < 1.0 {
        (12.0 - 9.0 * b - 6.0 * c) * a.powi(3)
            + (-18.0 + 12.0 * b + 6.0 * c) * a.powi(2)
            + (6.0 - 2.0 * b)
    } else if a < 2.0 {
        (-b - 6.0 * c) * a.powi(3)
            + (6.0 * b + 30.0 * c) * a.powi(2)
            + (-12.0 * b - 48.0 * c) * a
            + (8.0 * b + 24.0 * c)
    } else {
        0.0
    };
    k / 6.0
}

/// Cuántos pesos por coordenada, como mucho. Catmull-Rom tiene soporte 2: al
/// agrandar son 4 o 5; al achicar crecería con la razón, y ahí se usa el crate.
const MAXT: usize = 8;

/// Los pesos de un eje, con el mismo cálculo que `horizontal_sample` y
/// `vertical_sample` del crate: por cada coordenada de salida, la primera
/// entrada, cuántas, y sus pesos normalizados. `None` si no entran en MAXT.
#[cfg_attr(not(feature = "native"), allow(dead_code))]
fn pesos(n_in: u32, n_out: u32) -> Option<(Vec<u32>, Vec<u32>, Vec<f32>)> {
    let ratio = n_in as f32 / n_out as f32;
    let sratio = if ratio < 1.0 { 1.0 } else { ratio };
    let src_support = 2.0 * sratio;
    let (mut lefts, mut ns, mut ws) = (Vec::new(), Vec::new(), vec![0f32; n_out as usize * MAXT]);
    for o in 0..n_out {
        let input = (o as f32 + 0.5) * ratio;
        let left = ((input - src_support).floor() as i64).clamp(0, i64::from(n_in) - 1) as u32;
        let right = ((input + src_support).ceil() as i64)
            .clamp(i64::from(left) + 1, i64::from(n_in)) as u32;
        let input = input - 0.5;
        let n = (right - left) as usize;
        if n > MAXT {
            return None;
        }
        let fila = &mut ws[o as usize * MAXT..o as usize * MAXT + n];
        let mut sum = 0.0;
        for (k, i) in (left..right).enumerate() {
            let w = catmullrom((i as f32 - input) / sratio);
            fila[k] = w;
            sum += w;
        }
        for w in fila.iter_mut() {
            *w /= sum;
        }
        lefts.push(left);
        ns.push(n as u32);
    }
    Some((lefts, ns, ws))
}

#[cfg(feature = "native")]
unsafe extern "C" {
    fn winsi_resize_rgba(
        src: *const u8,
        w_in: u32,
        dst: *mut u8,
        w_out: u32,
        vy_left: *const u32,
        vy_n: *const u32,
        vy_w: *const f32,
        hx_left: *const u32,
        hx_n: *const u32,
        hx_w: *const f32,
        maxt: u32,
        y0: u32,
        y1: u32,
        fila: *mut f32,
        luma: u32,
    );
    #[cfg(winsi_v3)]
    fn winsi_resize_rgba_v3(
        src: *const u8,
        w_in: u32,
        dst: *mut u8,
        w_out: u32,
        vy_left: *const u32,
        vy_n: *const u32,
        vy_w: *const f32,
        hx_left: *const u32,
        hx_n: *const u32,
        hx_w: *const f32,
        maxt: u32,
        y0: u32,
        y1: u32,
        fila: *mut f32,
        luma: u32,
    );
}

/// Catmull-Rom en Zig, en franjas sobre todos los núcleos. `None` si el caso
/// no está cubierto (vacío, o achicar mucho) y hay que usar el crate.
#[cfg(feature = "native")]
pub fn catmullrom_nativo(img: &RgbaImage, w: u32, h: u32) -> Option<RgbaImage> {
    catmullrom_nativo_con(img, w, h, false)
}

/// Lo mismo; con `luma`, el alfa de la salida es la luminancia de su RGB (ver
/// lumaFila en resize.zig).
#[cfg(feature = "native")]
fn catmullrom_nativo_con(img: &RgbaImage, w: u32, h: u32, luma: bool) -> Option<RgbaImage> {
    let (w0, h0) = img.dimensions();
    if w0 == 0 || h0 == 0 || w == 0 || h == 0 || (w0, h0) == (w, h) {
        return None;
    }
    let (vl, vn, vw) = pesos(h0, h)?;
    let (hl, hn, hw) = pesos(w0, w)?;
    let mut salida = RgbaImage::new(w, h);
    let dst = salida.as_mut_ptr() as usize;
    let src = img.as_ptr() as usize;
    let hilos = (crate::anime4k::hilos() as u32).min(h);
    let paso = h.div_ceil(hilos);
    std::thread::scope(|s| {
        for t in 0..hilos {
            let (y0, y1) = (t * paso, ((t + 1) * paso).min(h));
            if y0 >= y1 {
                continue;
            }
            let (vl, vn, vw, hl, hn, hw) = (&vl, &vn, &vw, &hl, &hn, &hw);
            s.spawn(move || {
                let mut fila = vec![0f32; w0 as usize * 4];
                // SAFETY: `src` mide w0·h0·4 y los pesos solo apuntan dentro
                // (left + n <= h0, y lo mismo en x); `dst` mide w·h·4 y cada
                // hilo escribe solo sus filas [y0, y1); `fila` es de este hilo.
                unsafe {
                    crate::zig!(winsi_resize_rgba, winsi_resize_rgba_v3, src as *const u8,
                        w0,
                        dst as *mut u8,
                        w,
                        vl.as_ptr(),
                        vn.as_ptr(),
                        vw.as_ptr(),
                        hl.as_ptr(),
                        hn.as_ptr(),
                        hw.as_ptr(),
                        MAXT as u32,
                        y0,
                        y1,
                        fila.as_mut_ptr(),
                        u32::from(luma))
                }
            });
        }
    });
    Some(salida)
}

/// Lo que pide Anime4K para empezar: la imagen redimensionada en RGBA, con la
/// luminancia en el alfa. Con la feature `native`, el redimensionado la deja
/// escrita fila por fila al terminar cada una, mientras está en la caché (ver
/// lumaFila en resize.zig): un recorrido de la imagen menos. Da lo mismo bit a
/// bit que `catmullrom_rgba(&img.to_rgba8())` + `luminancia_en_alfa`, que es el
/// camino sin la feature.
pub fn para_anime4k(img: &image::DynamicImage, w: u32, h: u32) -> RgbaImage {
    // Un RGBA se usa tal cual; lo demás se convierte (leer RGB directo se
    // probó y es más lento, ver resize.zig).
    let convertida;
    let rgba = match img {
        image::DynamicImage::ImageRgba8(i) => i,
        otro => {
            convertida = otro.to_rgba8();
            &convertida
        }
    };
    #[cfg(feature = "native")]
    if std::env::var("WINSI_RESIZE").as_deref() != Ok("image") {
        if let Some(r) = catmullrom_nativo_con(rgba, w, h, true) {
            return r;
        }
    }
    let mut buf = catmullrom_rgba(rgba, w, h);
    crate::anime4k::luminancia_en_alfa(&mut buf);
    buf
}

/// Catmull-Rom con lo mejor disponible: Zig si está, el crate si no.
pub fn catmullrom_rgba(img: &RgbaImage, w: u32, h: u32) -> RgbaImage {
    #[cfg(feature = "native")]
    if std::env::var("WINSI_RESIZE").as_deref() != Ok("image") {
        if let Some(r) = catmullrom_nativo(img, w, h) {
            return r;
        }
    }
    image::imageops::resize(img, w, h, FilterType::CatmullRom)
}

#[cfg(all(test, feature = "native"))]
mod tests {
    use super::*;

    fn imagen(w: u32, h: u32, semilla: u32) -> RgbaImage {
        let mut s = semilla | 1;
        RgbaImage::from_fn(w, h, |x, y| {
            s ^= s << 13;
            s ^= s >> 17;
            s ^= s << 5;
            if (x / 5 + y / 3) % 3 == 0 {
                image::Rgba([250, 10, 128, 255])
            } else {
                image::Rgba([s as u8, (s >> 8) as u8, (s >> 16) as u8, (s >> 24) as u8])
            }
        })
    }

    #[test]
    fn da_lo_mismo_que_el_crate_bit_a_bit() {
        // Escalas de #upscale (x2, x3, x4) y tamaños que no son múltiplos de
        // nada, incluido el de un píxel.
        for (i, &(w, h)) in [(1, 1), (2, 3), (7, 5), (33, 17), (64, 48), (201, 97)]
            .iter()
            .enumerate()
        {
            for escala in [2u32, 3, 4] {
                let img = imagen(w, h, 11 + i as u32);
                let nuestro = catmullrom_nativo(&img, w * escala, h * escala).unwrap();
                let suyo =
                    image::imageops::resize(&img, w * escala, h * escala, FilterType::CatmullRom);
                assert!(nuestro == suyo, "{w}x{h} x{escala}: distinto del crate");
            }
        }
    }

    #[test]
    fn para_anime4k_da_lo_mismo_que_convertir_redimensionar_y_luminancia() {
        // RGB, RGBA y uno que hay que convertir (luma de 16 bits), en tamaños
        // que no son múltiplos de nada.
        for (i, &(w, h)) in [(1, 1), (7, 5), (33, 17), (201, 97)].iter().enumerate() {
            let rgba = imagen(w, h, 31 + i as u32);
            let rgb = image::DynamicImage::ImageRgba8(rgba.clone()).to_rgb8();
            let casos = [
                image::DynamicImage::ImageRgb8(rgb),
                image::DynamicImage::ImageRgba8(rgba.clone()),
                image::DynamicImage::ImageLuma16(image::DynamicImage::ImageRgba8(rgba).to_luma16()),
            ];
            for img in casos {
                let mut referencia = image::imageops::resize(&img.to_rgba8(), w * 2, h * 2, FilterType::CatmullRom);
                crate::anime4k::luminancia_en_alfa(&mut referencia);
                assert!(para_anime4k(&img, w * 2, h * 2) == referencia, "{w}x{h} {:?}", img.color());
            }
        }
    }

    #[test]
    fn tambien_con_proporciones_distintas_por_eje() {
        let img = imagen(40, 30, 5);
        let nuestro = catmullrom_nativo(&img, 97, 61).unwrap();
        let suyo = image::imageops::resize(&img, 97, 61, FilterType::CatmullRom);
        assert!(nuestro == suyo);
    }
}
