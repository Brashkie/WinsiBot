//! sticker.rs — una imagen a sticker WebP de WhatsApp, sin sharp.
//!
//! Hasta la 9.3.5 lo hacía sharp: un addon .node con libvips, 30 MB en disco y
//! 35 MB más de RAM en el proceso del bot desde el primer sticker. Ahora es la
//! Session API, que ya decodifica PNG y JPEG y ya redimensiona en Zig:
//!
//!   - decodificar: PNG y JPEG con el crate `image`; WebP con libwebp.
//!   - redimensionar: Catmull-Rom (resize.rs), en alfa premultiplicado si la
//!     imagen tiene transparencia, como sharp: sin eso, los píxeles
//!     transparentes —que suelen ser negros— tiñen los bordes.
//!   - codificar: WebP con pérdida, con libwebp (el código C de Google,
//!     compilado dentro del binario por `libwebp-sys`).
//!
//! Los animados (GIF, WebP animado) y los videos siguen por ffmpeg, del lado
//! del bot. El EXIF con el pack y el autor lo agrega el bot (webpExif.ts).

use image::RgbaImage;
use libwebp_sys::{WebPDecodeRGBAInto, WebPEncodeRGBA, WebPFree, WebPGetInfo};

/// El lado de un sticker de WhatsApp.
pub const LADO: u32 = 512;

/// Lo más grande que se acepta decodificar: 64 Mpx son 256 MB en RGBA. Una
/// foto de un teléfono son 12 a 50 Mpx; más que esto es una bomba.
pub const MAX_PIXELES: u64 = 64 << 20;

/// Lo más grande que se acepta recibir.
pub const MAX_ENTRADA: usize = 32 << 20;

pub fn es_webp(b: &[u8]) -> bool {
    b.len() >= 12 && &b[..4] == b"RIFF" && &b[8..12] == b"WEBP"
}

/// Un WebP animado: cabecera VP8X con el bit de animación (0x02).
pub fn es_webp_animado(b: &[u8]) -> bool {
    es_webp(b) && b.len() >= 21 && &b[12..16] == b"VP8X" && b[20] & 0x02 != 0
}

pub fn es_jpeg(b: &[u8]) -> bool {
    b.starts_with(&[0xFF, 0xD8, 0xFF])
}

/// Un JPEG directo a RGBA con zune-jpeg —el decodificador que `image` ya usa—:
/// el crate lo saca en RGB y convertirlo después costaba 17 ms en una foto de
/// 4000x3000, casi un tercio de todo. `None` si zune no puede (un CMYK, por
/// ejemplo), y ahí decide `image`.
fn jpeg_rgba(b: &[u8]) -> Option<Result<RgbaImage, String>> {
    use zune_core::{bytestream::ZCursor, colorspace::ColorSpace, options::DecoderOptions};
    let opciones = DecoderOptions::default().jpeg_set_out_colorspace(ColorSpace::RGBA);
    let mut d = zune_jpeg::JpegDecoder::new_with_options(ZCursor::new(b), opciones);
    d.decode_headers().ok()?;
    let (w, h) = d.dimensions()?;
    if w as u64 * h as u64 > MAX_PIXELES {
        return Some(Err(format!("demasiado grande: {w}x{h}")));
    }
    let mut img = RgbaImage::new(w as u32, h as u32);
    if d.output_buffer_size()? != img.len() {
        return None;
    }
    d.decode_into(&mut img).ok()?;
    Some(Ok(img))
}

/// PNG, JPEG o WebP estático, a RGBA.
pub fn decodificar(b: &[u8]) -> Result<RgbaImage, String> {
    if es_jpeg(b) {
        if let Some(r) = jpeg_rgba(b) {
            return r;
        }
    }
    if !es_webp(b) {
        let mut lector = image::ImageReader::new(std::io::Cursor::new(b))
            .with_guessed_format()
            .map_err(|e| e.to_string())?;
        let mut limites = image::Limits::default();
        limites.max_alloc = Some(MAX_PIXELES * 4);
        lector.limits(limites);
        return lector
            .decode()
            .map(|i| i.into_rgba8())
            .map_err(|e| format!("no se pudo leer la imagen: {e}"));
    }
    if es_webp_animado(b) {
        return Err("es un WebP animado".into());
    }
    let (mut w, mut h) = (0i32, 0i32);
    // SAFETY: libwebp solo lee `b`, en su largo, y escribe los dos enteros.
    if unsafe { WebPGetInfo(b.as_ptr(), b.len(), &mut w, &mut h) } == 0 || w <= 0 || h <= 0 {
        return Err("no es un WebP válido".into());
    }
    if w as u64 * h as u64 > MAX_PIXELES {
        return Err(format!("demasiado grande: {w}x{h}"));
    }
    let mut img = RgbaImage::new(w as u32, h as u32);
    let largo = img.len();
    // SAFETY: `img` mide w·h·4 bytes con filas de w·4, que es lo que se le
    // dice a libwebp; no escribe fuera de `largo`.
    let ok = unsafe { WebPDecodeRGBAInto(b.as_ptr(), b.len(), img.as_mut_ptr(), largo, w * 4) };
    if ok.is_null() {
        return Err("no se pudo decodificar el WebP".into());
    }
    Ok(img)
}

/// RGBA a WebP con pérdida (`calidad` de 0 a 100), con los valores por defecto
/// de libwebp —los mismos que sharp—: esfuerzo 4 y el alfa sin pérdida.
pub fn codificar_webp(img: &RgbaImage, calidad: f32) -> Result<Vec<u8>, String> {
    let (w, h) = img.dimensions();
    let mut salida: *mut u8 = std::ptr::null_mut();
    // SAFETY: `img` mide w·h·4 con filas de w·4; libwebp reserva la salida y
    // la devuelve en `salida`, que se libera con WebPFree.
    let n = unsafe {
        WebPEncodeRGBA(
            img.as_ptr(),
            w as i32,
            h as i32,
            (w * 4) as i32,
            calidad.clamp(0.0, 100.0),
            &mut salida,
        )
    };
    if salida.is_null() || n == 0 {
        return Err("libwebp no pudo codificar".into());
    }
    // SAFETY: libwebp escribió `n` bytes en `salida`.
    let v = unsafe { std::slice::from_raw_parts(salida, n) }.to_vec();
    unsafe { WebPFree(salida.cast()) };
    Ok(v)
}

/// El tamaño al que va: lo que entra en 512×512 manteniendo la proporción.
/// Sin `agrandar`, una imagen más chica queda como está.
pub fn tamano(w: u32, h: u32, agrandar: bool) -> (u32, u32) {
    if !agrandar && w <= LADO && h <= LADO {
        return (w, h);
    }
    let (lado, otro) = (w.max(h) as u64, w.min(h) as u64);
    let corto = ((otro * LADO as u64 + lado / 2) / lado).max(1) as u32;
    if w >= h {
        (LADO, corto)
    } else {
        (corto, LADO)
    }
}

fn tiene_alfa(img: &RgbaImage) -> bool {
    img.as_raw().as_chunks::<4>().0.iter().any(|p| p[3] != 255)
}

fn premultiplicar(img: &mut RgbaImage) {
    for p in img.as_mut().as_chunks_mut::<4>().0 {
        let a = u32::from(p[3]);
        for c in &mut p[..3] {
            *c = ((u32::from(*c) * a + 127) / 255) as u8;
        }
    }
}

pub(crate) fn despremultiplicar(img: &mut RgbaImage) {
    for p in img.as_mut().as_chunks_mut::<4>().0 {
        let a = u32::from(p[3]);
        if a == 0 {
            p[..3].fill(0);
        } else if a < 255 {
            for c in &mut p[..3] {
                *c = ((u32::from(*c) * 255 + a / 2) / a).min(255) as u8;
            }
        }
    }
}

/// Redimensiona a `w`×`h`; en alfa premultiplicado si hay transparencia.
pub(crate) fn redimensionar(mut img: RgbaImage, w: u32, h: u32) -> RgbaImage {
    if img.dimensions() == (w, h) {
        return img;
    }
    let alfa = tiene_alfa(&img);
    if alfa {
        premultiplicar(&mut img);
    }
    let mut r = crate::resize::catmullrom_rgba(&img, w, h);
    if alfa {
        despremultiplicar(&mut r);
    }
    r
}

/// La imagen, de sticker. `completo`: ocupa 512×512, centrada y con lo que
/// sobra transparente —como se ven los animados—; si no, con su proporción y
/// como mucho 512 de lado.
///
/// Un GIF o un WebP animado sale WebP animado (ver animation.rs).
pub fn sticker(b: &[u8], calidad: f32, completo: bool) -> Result<Vec<u8>, String> {
    if crate::animation::es_animado(b) {
        return crate::animation::sticker_animado(b, calidad, completo);
    }
    codificar_webp(&encuadrar(decodificar(b)?, completo), calidad)
}

/// La imagen al tamaño de sticker: con `completo`, centrada en 512×512 y
/// transparente alrededor; si no, con su proporción y como mucho 512 de lado.
pub(crate) fn encuadrar(img: RgbaImage, completo: bool) -> RgbaImage {
    let (w, h) = tamano(img.width(), img.height(), completo);
    let img = redimensionar(img, w, h);
    if !completo || (w, h) == (LADO, LADO) {
        return img;
    }
    let mut lienzo = RgbaImage::new(LADO, LADO);
    image::imageops::replace(
        &mut lienzo,
        &img,
        i64::from((LADO - w) / 2),
        i64::from((LADO - h) / 2),
    );
    lienzo
}

// ── Endpoint ─────────────────────────────────────────────────────────────────

use axum::{
    body::Bytes,
    extract::{DefaultBodyLimit, Query},
    http::{header, StatusCode},
    response::{IntoResponse, Response},
    routing::{post, MethodRouter},
};

/// La ruta, con su límite: el de axum por defecto es 2 MB, y una foto de un
/// teléfono pasa de eso.
pub fn ruta<S: Clone + Send + Sync + 'static>() -> MethodRouter<S> {
    post(handler).layer(DefaultBodyLimit::max(MAX_ENTRADA))
}
use serde::Deserialize;

#[derive(Deserialize)]
pub struct StickerQuery {
    calidad: Option<f32>,
    completo: Option<u8>,
}

/// POST /image/sticker?calidad=50&completo=0 — la imagen en el cuerpo, tal
/// cual (sin base64: un tercio menos y sin JSON). Devuelve el WebP, o 422
/// con el motivo si no es una imagen que se pueda leer.
pub async fn handler(Query(q): Query<StickerQuery>, cuerpo: Bytes) -> Response {
    let calidad = q.calidad.unwrap_or(50.0);
    let completo = q.completo == Some(1);
    match tokio::task::spawn_blocking(move || sticker(&cuerpo, calidad, completo)).await {
        Ok(Ok(webp)) => ([(header::CONTENT_TYPE, "image/webp")], webp).into_response(),
        Ok(Err(e)) => (StatusCode::UNPROCESSABLE_ENTITY, e).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn png(img: &RgbaImage) -> Vec<u8> {
        let mut v = Vec::new();
        img.write_to(&mut std::io::Cursor::new(&mut v), image::ImageFormat::Png)
            .unwrap();
        v
    }

    #[test]
    fn el_tamano_entra_en_512() {
        assert_eq!(tamano(1536, 1024, false), (512, 341));
        assert_eq!(tamano(1024, 1536, false), (341, 512));
        assert_eq!(tamano(300, 200, false), (300, 200));
        assert_eq!(tamano(300, 200, true), (512, 341));
        assert_eq!(tamano(5000, 3, false), (512, 1));
        assert_eq!(tamano(512, 512, true), (512, 512));
    }

    #[test]
    fn un_png_sale_webp_de_512() {
        let mut img = RgbaImage::new(1536, 1024);
        for (x, y, p) in img.enumerate_pixels_mut() {
            *p = image::Rgba([(x % 256) as u8, (y % 256) as u8, 90, 255]);
        }
        let webp = sticker(&png(&img), 50.0, false).unwrap();
        assert!(es_webp(&webp) && !es_webp_animado(&webp));
        let vuelta = decodificar(&webp).unwrap();
        assert_eq!(vuelta.dimensions(), (512, 341));
    }

    #[test]
    fn completo_es_512_centrado_y_transparente_alrededor() {
        let img = RgbaImage::from_pixel(400, 100, image::Rgba([200, 30, 30, 255]));
        let webp = sticker(&png(&img), 80.0, true).unwrap();
        let v = decodificar(&webp).unwrap();
        assert_eq!(v.dimensions(), (512, 512));
        // Arriba y abajo, transparente; al medio, el rojo.
        assert_eq!(v.get_pixel(256, 10)[3], 0);
        assert_eq!(v.get_pixel(256, 500)[3], 0);
        let c = v.get_pixel(256, 256);
        assert!(c[3] == 255 && c[0] > 150 && c[1] < 80, "{c:?}");
    }

    #[test]
    fn la_transparencia_no_tine_los_bordes() {
        // Un círculo blanco sobre transparente NEGRO: sin premultiplicar, al
        // achicar, el borde sale gris.
        let mut img = RgbaImage::new(1024, 1024);
        for (x, y, p) in img.enumerate_pixels_mut() {
            let (dx, dy) = (x as i32 - 512, y as i32 - 512);
            if dx * dx + dy * dy < 400 * 400 {
                *p = image::Rgba([255, 255, 255, 255]);
            }
        }
        let r = redimensionar(img, 512, 512);
        for p in r.pixels().filter(|p| p[3] > 16) {
            assert!(p[0] > 230, "borde teñido: {p:?}");
        }
    }

    #[test]
    fn rechaza_lo_que_no_es_imagen() {
        assert!(sticker(b"hola", 50.0, false).is_err());
        assert!(decodificar(b"RIFF\0\0\0\0WEBPVP8 basura").is_err());
        let mut animado = b"RIFF\0\0\0\0WEBPVP8X\x0a\0\0\0".to_vec();
        animado.extend_from_slice(&[0x02, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
        assert!(es_webp_animado(&animado));
        assert!(decodificar(&animado).is_err());
    }

    #[test]
    fn el_jpeg_directo_a_rgba_da_lo_mismo_que_el_crate() {
        let mut rgb = image::RgbImage::new(333, 211);
        for (x, y, p) in rgb.enumerate_pixels_mut() {
            *p = image::Rgb([(x * 7) as u8, (y * 3) as u8, ((x ^ y) * 5) as u8]);
        }
        let gris = image::DynamicImage::ImageRgb8(rgb.clone()).to_luma8();
        let mut jpeg_gris = Vec::new();
        gris.write_to(
            &mut std::io::Cursor::new(&mut jpeg_gris),
            image::ImageFormat::Jpeg,
        )
        .unwrap();
        for jpeg in [crate::jpeg::codificar(&rgb, 85), jpeg_gris] {
            assert!(es_jpeg(&jpeg));
            let nuestro = jpeg_rgba(&jpeg).expect("zune no pudo").unwrap();
            let suyo = image::load_from_memory(&jpeg).unwrap().to_rgba8();
            assert!(nuestro == suyo);
        }
    }

    /// La ruta de verdad, por HTTP: una imagen de más de 2 MB —el límite de
    /// axum por defecto— entra y vuelve un WebP; lo que no es imagen, 422.
    #[tokio::test]
    async fn la_ruta_acepta_imagenes_grandes() {
        let app = axum::Router::new().route("/image/sticker", ruta());
        let escucha = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let dir = escucha.local_addr().unwrap();
        tokio::spawn(async move { axum::serve(escucha, app).await.unwrap() });

        // Ruido: un PNG que no comprime, de ~6 MB.
        let mut s = 0x9E37_79B9u32;
        let img = RgbaImage::from_fn(1400, 1100, |_, _| {
            s ^= s << 13;
            s ^= s >> 17;
            s ^= s << 5;
            image::Rgba([s as u8, (s >> 8) as u8, (s >> 16) as u8, 255])
        });
        let cuerpo = png(&img);
        assert!(cuerpo.len() > 2 << 20, "{}", cuerpo.len());

        let cliente = reqwest::Client::new();
        let url = format!("http://{dir}/image/sticker?calidad=50&completo=1");
        let r = cliente.post(&url).body(cuerpo).send().await.unwrap();
        assert_eq!(r.status(), 200);
        assert_eq!(r.headers()["content-type"], "image/webp");
        let webp = r.bytes().await.unwrap();
        assert_eq!(decodificar(&webp).unwrap().dimensions(), (512, 512));

        let r = cliente.post(&url).body("hola").send().await.unwrap();
        assert_eq!(r.status(), 422);
    }

    #[test]
    fn webp_de_ida_y_vuelta() {
        let img = RgbaImage::from_pixel(64, 48, image::Rgba([10, 120, 240, 255]));
        let webp = codificar_webp(&img, 90.0).unwrap();
        let v = decodificar(&webp).unwrap();
        assert_eq!(v.dimensions(), (64, 48));
        let p = v.get_pixel(30, 20);
        assert!(
            p[0].abs_diff(10) < 12 && p[1].abs_diff(120) < 12 && p[2].abs_diff(240) < 12,
            "{p:?}"
        );
    }
}
