//! animation.rs — GIF y WebP animado, sin sharp.
//!
//! Dos cosas que hacía sharp (libvips) del lado del bot:
//!
//!   - Un sticker animado a partir de un GIF o un WebP animado
//!     ([`sticker_animado`]): cada cuadro se decodifica, se lleva al tamaño de
//!     sticker con el redimensionado de Zig y entra al codificador de WebP
//!     animado de libwebp, de a uno: en memoria nunca están todos los
//!     cuadros, solo el que se está procesando.
//!   - #toimg de un sticker animado ([`a_mjpeg`]): sharp lo pasaba a GIF y
//!     ffmpeg de GIF a MP4, porque ffmpeg no lee bien el WebP animado. Ahora
//!     salen los cuadros como JPEG seguidos (MJPEG) a ritmo fijo, sobre
//!     blanco —un MP4 no tiene transparencia—, y ffmpeg los pasa a MP4.
//!
//! Con los mismos topes que un sticker de video (sticker.ts): 10 segundos y
//! 15 cuadros por segundo. Más largo o más fluido solo pesa más, y WhatsApp
//! rechaza los stickers muy pesados.

use image::{AnimationDecoder, ImageDecoder, RgbaImage};
use libwebp_sys as webp;

/// Lo que dura como mucho un sticker animado, en ms.
pub const MS_MAX: u32 = 10_000;
/// Cuántos cuadros por segundo, como mucho.
pub const FPS_MAX: u32 = 15;
/// Lo que dura como mucho el video de #toimg, en ms.
pub const MS_MAX_VIDEO: u32 = 30_000;

pub fn es_gif(b: &[u8]) -> bool {
    b.starts_with(b"GIF8")
}

/// Un GIF (aunque tenga un solo cuadro: sale animado igual, como con sharp) o
/// un WebP animado.
pub fn es_animado(b: &[u8]) -> bool {
    es_gif(b) || crate::sticker::es_webp_animado(b)
}

/// Recorre los cuadros de un GIF o WebP animado: `f(cuadro, inicio, fin)`,
/// en ms, ya compuestos sobre el lienzo entero. Para en `tope_ms`.
pub fn cuadros(
    b: &[u8],
    tope_ms: u32,
    f: &mut dyn FnMut(&RgbaImage, u32, u32) -> Result<(), String>,
) -> Result<(), String> {
    if es_gif(b) {
        cuadros_gif(b, tope_ms, f)
    } else if crate::sticker::es_webp_animado(b) {
        cuadros_webp(b, tope_ms, f)
    } else {
        Err("no es un GIF ni un WebP animado".into())
    }
}

fn revisar_lienzo(w: u32, h: u32) -> Result<(), String> {
    if w == 0 || h == 0 || u64::from(w) * u64::from(h) > 16 << 20 {
        return Err(format!("tamaño inválido: {w}x{h}"));
    }
    Ok(())
}

fn cuadros_gif(
    b: &[u8],
    tope_ms: u32,
    f: &mut dyn FnMut(&RgbaImage, u32, u32) -> Result<(), String>,
) -> Result<(), String> {
    let dec = image::codecs::gif::GifDecoder::new(std::io::Cursor::new(b))
        .map_err(|e| format!("GIF inválido: {e}"))?;
    let (w, h) = dec.dimensions();
    revisar_lienzo(w, h)?;
    let mut t = 0u32;
    for cuadro in dec.into_frames() {
        let cuadro = cuadro.map_err(|e| format!("GIF inválido: {e}"))?;
        let (n, d) = cuadro.delay().numer_denom_ms();
        // Como los navegadores: menos de 20 ms es "lo más rápido posible", y
        // se muestra a 100 ms.
        let ms = n.checked_div(d).unwrap_or(0);
        let ms = if ms < 20 { 100 } else { ms };
        let fin = t.saturating_add(ms).min(tope_ms);
        f(cuadro.buffer(), t, fin)?;
        t = fin;
        if t >= tope_ms {
            break;
        }
    }
    if t == 0 {
        return Err("el GIF no tiene cuadros".into());
    }
    Ok(())
}

/// Libera el decodificador de libwebp al salir, también en un error.
struct DecAnim(*mut webp::WebPAnimDecoder);
impl Drop for DecAnim {
    fn drop(&mut self) {
        // SAFETY: lo creó WebPAnimDecoderNewInternal y se libera una vez.
        unsafe { webp::WebPAnimDecoderDelete(self.0) }
    }
}

fn cuadros_webp(
    b: &[u8],
    tope_ms: u32,
    f: &mut dyn FnMut(&RgbaImage, u32, u32) -> Result<(), String>,
) -> Result<(), String> {
    let datos = webp::WebPData {
        bytes: b.as_ptr(),
        size: b.len(),
    };
    // SAFETY: las opciones se inicializan con la función de libwebp antes de
    // usarse; `datos` apunta a `b`, que vive más que el decodificador.
    let dec = unsafe {
        let mut op: webp::WebPAnimDecoderOptions = std::mem::zeroed();
        if webp::WebPAnimDecoderOptionsInitInternal(&mut op, webp::WEBP_DEMUX_ABI_VERSION as i32)
            == 0
        {
            return Err("libwebp: versión incompatible".into());
        }
        op.color_mode = webp::WEBP_CSP_MODE::MODE_RGBA;
        op.use_threads = 0;
        webp::WebPAnimDecoderNewInternal(&datos, &op, webp::WEBP_DEMUX_ABI_VERSION as i32)
    };
    if dec.is_null() {
        return Err("WebP animado inválido".into());
    }
    let dec = DecAnim(dec);
    // SAFETY: `dec.0` es un decodificador válido.
    let info = unsafe {
        let mut info: webp::WebPAnimInfo = std::mem::zeroed();
        if webp::WebPAnimDecoderGetInfo(dec.0, &mut info) == 0 {
            return Err("WebP animado inválido".into());
        }
        info
    };
    let (w, h) = (info.canvas_width, info.canvas_height);
    revisar_lienzo(w, h)?;
    let mut lienzo = RgbaImage::new(w, h);
    let mut t = 0u32;
    // SAFETY: GetNext devuelve el lienzo entero, w·h·4 bytes en RGBA, que vale
    // hasta la próxima llamada: se copia antes.
    while unsafe { webp::WebPAnimDecoderHasMoreFrames(dec.0) } != 0 {
        let (mut buf, mut fin_ms) = (std::ptr::null_mut(), 0i32);
        if unsafe { webp::WebPAnimDecoderGetNext(dec.0, &mut buf, &mut fin_ms) } == 0
            || buf.is_null()
        {
            return Err("WebP animado inválido".into());
        }
        let n = lienzo.len();
        lienzo.copy_from_slice(unsafe { std::slice::from_raw_parts(buf, n) });
        // El tiempo que da libwebp es el del FIN del cuadro.
        let fin = (fin_ms.max(0) as u32).max(t).min(tope_ms);
        let fin = if fin == t {
            (t + 100).min(tope_ms)
        } else {
            fin
        };
        f(&lienzo, t, fin)?;
        t = fin;
        if t >= tope_ms {
            break;
        }
    }
    if t == 0 {
        return Err("el WebP no tiene cuadros".into());
    }
    Ok(())
}

// ── Sticker animado ──────────────────────────────────────────────────────────

/// El codificador de WebP animado de libwebp, liberado al salir.
struct CodAnim {
    enc: *mut webp::WebPAnimEncoder,
    config: webp::WebPConfig,
    w: u32,
    h: u32,
}

impl CodAnim {
    fn nuevo(w: u32, h: u32, calidad: f32) -> Result<Self, String> {
        // SAFETY: opciones y configuración se inicializan con las funciones
        // de libwebp, que verifican la versión de la estructura.
        unsafe {
            let mut op: webp::WebPAnimEncoderOptions = std::mem::zeroed();
            if webp::WebPAnimEncoderOptionsInitInternal(&mut op, webp::WEBP_MUX_ABI_VERSION as i32)
                == 0
            {
                return Err("libwebp: versión incompatible".into());
            }
            op.anim_params.loop_count = 0; // para siempre
            let mut config: webp::WebPConfig = std::mem::zeroed();
            if webp::WebPConfigInitInternal(
                &mut config,
                webp::WebPPreset::WEBP_PRESET_DEFAULT,
                calidad.clamp(0.0, 100.0),
                webp::WEBP_ENCODER_ABI_VERSION as i32,
            ) == 0
            {
                return Err("libwebp: versión incompatible".into());
            }
            let enc = webp::WebPAnimEncoderNewInternal(
                w as i32,
                h as i32,
                &op,
                webp::WEBP_MUX_ABI_VERSION as i32,
            );
            if enc.is_null() {
                return Err("libwebp no pudo crear el codificador".into());
            }
            Ok(CodAnim { enc, config, w, h })
        }
    }

    fn agregar(&mut self, img: &RgbaImage, ms: u32) -> Result<(), String> {
        debug_assert_eq!(img.dimensions(), (self.w, self.h));
        // SAFETY: la imagen mide w·h·4 con filas de w·4; la WebPPicture se
        // inicializa, se llena con una copia y se libera aquí mismo.
        unsafe {
            let mut pic: webp::WebPPicture = std::mem::zeroed();
            if webp::WebPPictureInitInternal(&mut pic, webp::WEBP_ENCODER_ABI_VERSION as i32) == 0 {
                return Err("libwebp: versión incompatible".into());
            }
            pic.use_argb = 1;
            pic.width = self.w as i32;
            pic.height = self.h as i32;
            let ok = webp::WebPPictureImportRGBA(&mut pic, img.as_ptr(), (self.w * 4) as i32) != 0
                && webp::WebPAnimEncoderAdd(self.enc, &mut pic, ms as i32, &self.config) != 0;
            webp::WebPPictureFree(&mut pic);
            if !ok {
                return Err("libwebp no pudo agregar el cuadro".into());
            }
        }
        Ok(())
    }

    fn terminar(self, fin_ms: u32) -> Result<Vec<u8>, String> {
        // SAFETY: un cuadro nulo cierra la animación en `fin_ms`; los datos
        // armados los reserva libwebp y se liberan con WebPFree tras copiarlos.
        unsafe {
            let mut datos = webp::WebPData {
                bytes: std::ptr::null(),
                size: 0,
            };
            let ok = webp::WebPAnimEncoderAdd(
                self.enc,
                std::ptr::null_mut(),
                fin_ms as i32,
                std::ptr::null(),
            ) != 0
                && webp::WebPAnimEncoderAssemble(self.enc, &mut datos) != 0;
            if !ok || datos.bytes.is_null() {
                return Err("libwebp no pudo armar la animación".into());
            }
            let v = std::slice::from_raw_parts(datos.bytes, datos.size).to_vec();
            webp::WebPFree(datos.bytes as *mut _);
            Ok(v)
        }
    }
}

impl Drop for CodAnim {
    fn drop(&mut self) {
        // SAFETY: lo creó WebPAnimEncoderNewInternal y se libera una vez.
        unsafe { webp::WebPAnimEncoderDelete(self.enc) }
    }
}

/// Un GIF o WebP animado a sticker WebP animado: como mucho 10 s y 15 cuadros
/// por segundo, cada cuadro encuadrado como un sticker estático
/// (`sticker::encuadrar`).
pub fn sticker_animado(b: &[u8], calidad: f32, completo: bool) -> Result<Vec<u8>, String> {
    let paso = 1000 / FPS_MAX;
    let mut cod: Option<CodAnim> = None;
    let mut proximo = 0u32;
    let mut fin_total = 0u32;
    cuadros(b, MS_MAX, &mut |img, inicio, fin| {
        fin_total = fin;
        // Un cuadro que empieza antes del próximo turno se saltea: el
        // anterior queda en pantalla hasta el siguiente que se tome.
        if inicio < proximo {
            return Ok(());
        }
        // Turnos en una grilla fija (0, 66, 133...): contar desde el cuadro
        // tomado corría el corte, y con cuadros de 20 ms salía a 12,5 fps.
        while proximo <= inicio {
            proximo += paso;
        }
        let cuadro = crate::sticker::encuadrar(img.clone(), completo);
        if cod.is_none() {
            cod = Some(CodAnim::nuevo(cuadro.width(), cuadro.height(), calidad)?);
        }
        cod.as_mut()
            .expect("recién creado")
            .agregar(&cuadro, inicio)
    })?;
    cod.ok_or("sin cuadros")?.terminar(fin_total.max(1))
}

// ── #toimg de un animado: MJPEG ──────────────────────────────────────────────

/// RGBA sobre blanco: un MP4 no tiene transparencia.
fn sobre_blanco(img: &RgbaImage) -> RgbaImage {
    let mut r = img.clone();
    for p in r.as_mut().as_chunks_mut::<4>().0 {
        let a = u32::from(p[3]);
        for c in &mut p[..3] {
            *c = ((u32::from(*c) * a + 255 * (255 - a) + 127) / 255) as u8;
        }
        p[3] = 255;
    }
    r
}

/// Los cuadros de un GIF o WebP animado como JPEG seguidos (MJPEG), uno cada
/// `1000 / fps` ms —repitiendo el que esté en pantalla—, sobre blanco: lo que
/// ffmpeg lee con `-f mjpeg -framerate <fps>`. Como mucho 30 s.
pub fn a_mjpeg(b: &[u8], fps: u32) -> Result<Vec<u8>, String> {
    let fps = fps.clamp(1, 30);
    let mut salida = Vec::new();
    let mut k = 0u32; // el próximo cuadro de salida, en t = k·1000/fps
    cuadros(b, MS_MAX_VIDEO, &mut |img, _inicio, fin| {
        let mut jpeg: Option<Vec<u8>> = None;
        while k * 1000 / fps < fin {
            let j = jpeg.get_or_insert_with(|| crate::jpeg::codificar_rgba(&sobre_blanco(img), 85));
            salida.extend_from_slice(j);
            k += 1;
        }
        Ok(())
    })?;
    if salida.is_empty() {
        return Err("sin cuadros".into());
    }
    Ok(salida)
}

// ── Endpoint ─────────────────────────────────────────────────────────────────

use axum::{
    body::Bytes,
    extract::{DefaultBodyLimit, Query},
    http::{header, StatusCode},
    response::{IntoResponse, Response},
    routing::{post, MethodRouter},
};

#[derive(serde::Deserialize)]
pub struct MjpegQuery {
    fps: Option<u32>,
}

/// POST /image/mjpeg?fps=15 — el GIF o WebP animado en el cuerpo; devuelve
/// los cuadros en MJPEG.
pub async fn mjpeg_handler(Query(q): Query<MjpegQuery>, cuerpo: Bytes) -> Response {
    let fps = q.fps.unwrap_or(FPS_MAX);
    match tokio::task::spawn_blocking(move || a_mjpeg(&cuerpo, fps)).await {
        Ok(Ok(v)) => ([(header::CONTENT_TYPE, "video/x-motion-jpeg")], v).into_response(),
        Ok(Err(e)) => (StatusCode::UNPROCESSABLE_ENTITY, e).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

pub fn ruta_mjpeg<S: Clone + Send + Sync + 'static>() -> MethodRouter<S> {
    post(mjpeg_handler).layer(DefaultBodyLimit::max(crate::sticker::MAX_ENTRADA))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Un GIF de `n` cuadros de colores, `ms` cada uno, de `w`×`h`.
    pub(crate) fn gif(n: usize, ms: u32, w: u16, h: u16) -> Vec<u8> {
        let mut v = Vec::new();
        {
            let mut enc = image::codecs::gif::GifEncoder::new(&mut v);
            enc.set_repeat(image::codecs::gif::Repeat::Infinite)
                .unwrap();
            for i in 0..n {
                let c = [(i * 40) as u8, 255 - (i * 40) as u8, 128, 255];
                let img = RgbaImage::from_pixel(u32::from(w), u32::from(h), image::Rgba(c));
                let f =
                    image::Frame::from_parts(img, 0, 0, image::Delay::from_numer_denom_ms(ms, 1));
                enc.encode_frame(f).unwrap();
            }
        }
        v
    }

    fn info_webp(b: &[u8]) -> (u32, u32, u32, Vec<u32>) {
        let mut tiempos = Vec::new();
        let mut dim = (0, 0);
        cuadros(b, u32::MAX, &mut |img, _i, fin| {
            dim = img.dimensions();
            tiempos.push(fin);
            Ok(())
        })
        .unwrap();
        (dim.0, dim.1, tiempos.len() as u32, tiempos)
    }

    #[test]
    fn un_gif_sale_webp_animado_de_512() {
        let g = gif(5, 200, 300, 150);
        assert!(es_animado(&g));
        let w = crate::sticker::sticker(&g, 50.0, true).unwrap();
        assert!(crate::sticker::es_webp_animado(&w));
        let (ancho, alto, n, tiempos) = info_webp(&w);
        assert_eq!((ancho, alto, n), (512, 512, 5));
        assert_eq!(*tiempos.last().unwrap(), 1000);
    }

    #[test]
    fn respeta_los_topes_de_10_s_y_15_fps() {
        // 300 cuadros de 20 ms = 6 s a 50 fps: quedan ~15 por segundo.
        let g = gif(300, 20, 64, 64);
        let (_, _, n, t) = info_webp(&sticker_animado(&g, 50.0, false).unwrap());
        assert!((85..=95).contains(&n), "{n} cuadros");
        assert_eq!(*t.last().unwrap(), 6000);
        // 40 cuadros de 500 ms = 20 s: se corta en 10.
        let g = gif(40, 500, 64, 64);
        let (w, h, n, t) = info_webp(&sticker_animado(&g, 50.0, false).unwrap());
        assert_eq!((w, h, n), (64, 64, 20));
        assert_eq!(*t.last().unwrap(), 10_000);
    }

    #[test]
    fn un_webp_animado_vuelve_a_salir_animado() {
        let w = sticker_animado(&gif(3, 300, 600, 400), 60.0, false).unwrap();
        let w2 = crate::sticker::sticker(&w, 60.0, true).unwrap();
        let (ancho, alto, n, t) = info_webp(&w2);
        assert_eq!((ancho, alto, n), (512, 512, 3));
        assert_eq!(*t.last().unwrap(), 900);
    }

    #[test]
    fn mjpeg_a_ritmo_fijo_sobre_blanco() {
        // 3 cuadros de 200 ms a 15 fps: 600 ms → 9 JPEG.
        let mut img = RgbaImage::new(32, 32); // transparente
        img.put_pixel(0, 0, image::Rgba([0, 0, 0, 255]));
        let mut v = Vec::new();
        {
            let mut enc = image::codecs::gif::GifEncoder::new(&mut v);
            for _ in 0..3 {
                let f = image::Frame::from_parts(
                    img.clone(),
                    0,
                    0,
                    image::Delay::from_numer_denom_ms(200, 1),
                );
                enc.encode_frame(f).unwrap();
            }
        }
        let m = a_mjpeg(&v, 15).unwrap();
        let inicios = m.windows(3).filter(|w| w == &[0xFF, 0xD8, 0xFF]).count();
        assert_eq!(inicios, 9);
        // El primer JPEG: lo transparente, blanco.
        let fin = m.windows(2).position(|w| w == [0xFF, 0xD9]).unwrap() + 2;
        let primero = image::load_from_memory(&m[..fin]).unwrap().to_rgb8();
        assert!(primero.get_pixel(20, 20).0.iter().all(|&c| c > 240));
    }

    #[test]
    fn rechaza_lo_que_no_es_animado() {
        assert!(sticker_animado(b"hola", 50.0, false).is_err());
        assert!(a_mjpeg(b"GIF89a basura", 15).is_err());
        assert!(!es_animado(b"\x89PNG"));
    }
}
