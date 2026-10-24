//! vision.rs — modelos de imagen con ONNX Runtime.
//!
//! Routes: POST /vision/removebg, POST /vision/toanime
//!
//! Portado de python/ml/anime.py. Estos eran los últimos comandos que ataban el
//! proyecto a Python, y resultó que **dos de los tres no necesitaban torch**:
//! `dghs-imgutils` ya corría sus modelos con ONNX Runtime, y torch era apenas
//! un `extra` suyo que el proyecto no usaba. Solo `#toanime` lo necesitaba, por
//! cargar AnimeGANv2 con `torch.hub`.
//!
//! El cambio de peso es el argumento entero:
//!
//! | Antes (Python)        | Ahora (Rust)              |
//! |-----------------------|---------------------------|
//! | torch, 3,7 GB         | face_paint, 8 MB          |
//! | onnxruntime, 185 MB   | el runtime va en el binario |
//! | opencv, 154 MB        | el crate `image`, ya estaba |
//! | dghs-imgutils + deps  | —                         |
//!
//! Y lo que de verdad importa: en Termux el problema nunca fue que faltaran
//! binarios —las ruedas de PyPI YA son binarios— sino la libc. Las ruedas de
//! ARM se publican como `manylinux`, que asume glibc, y Android usa Bionic. El
//! runtime de ONNX como librería nativa no tiene ese problema.
//!
//! Los modelos NO se incrustan en el binario, a diferencia de las tablas de
//! personalidad: son 8 MB y 168 MB, y quien no use estos comandos no tiene por
//! qué cargarlos. Se bajan la primera vez y quedan cacheados en disco.

use axum::{extract::State, response::Json};
use base64::{engine::general_purpose::STANDARD as B64, Engine};
use image::{imageops::FilterType, DynamicImage, RgbImage, RgbaImage};
use ndarray::{Array4, ArrayView4};
use ort::session::Session;
use serde::Deserialize;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};

use crate::anime4k::{
    self, A4K_FUERZA_COLOR, A4K_FUERZA_GRADIENTE, A4K_MAX_PIXELES_SALIDA, A4K_PASADAS,
};
use crate::routes::AppState;

// ── Modelos ──────────────────────────────────────────────────────────────────

/// Lado al que isnetis espera la entrada, con relleno para que quede cuadrada.
/// El valor viene del espacio original del modelo (skytnt/anime-remove-background).
const ISNETIS_LADO: u32 = 1024;
/// AnimeGANv2 se exportó a ONNX con forma FIJA de 512x512 — el modelo original
/// en PyTorch es totalmente convolucional y aceptaba cualquier tamaño, pero el
/// export no. Se redimensiona a 512, se infiere y se vuelve al tamaño original.
const ANIMEGAN_LADO: u32 = 512;

struct Modelo {
    archivo: &'static str,
    url: &'static str,
    /// Para avisar en el log antes de empezar una descarga larga.
    mb: u32,
}

const ISNETIS: Modelo = Modelo {
    archivo: "isnetis.onnx",
    url: "https://huggingface.co/skytnt/anime-seg/resolve/main/isnetis.onnx",
    mb: 168,
};

const ANIMEGAN: Modelo = Modelo {
    archivo: "face_paint_512_v2.onnx",
    url: "https://huggingface.co/akhaliq/AnimeGANv2-ONNX/resolve/main/face_paint_512_v2_0.onnx",
    mb: 8,
};

fn dir_modelos() -> PathBuf {
    PathBuf::from(std::env::var("MODELS_DIR").unwrap_or_else(|_| "data/models".into()))
}

/// Baja el modelo si no está, y devuelve su ruta.
///
/// Se escribe a un `.tmp` y se renombra al final: una descarga cortada a la
/// mitad dejaría un ONNX truncado que después falla al cargar con un error que
/// no dice nada, y el usuario no tendría forma de saber que basta con borrarlo.
async fn asegurar_modelo(m: &Modelo) -> Result<PathBuf, String> {
    let dir = dir_modelos();
    let destino = dir.join(m.archivo);
    if destino.exists() {
        return Ok(destino);
    }

    std::fs::create_dir_all(&dir)
        .map_err(|e| format!("no se pudo crear {}: {e}", dir.display()))?;
    tracing::info!(
        "descargando modelo {} ({} MB), solo la primera vez",
        m.archivo,
        m.mb
    );

    let cliente = reqwest::Client::builder()
        // Sin timeout total: 168 MB en una conexión lenta pueden tardar mucho y
        // cortar a la mitad obligaría a empezar de cero.
        .timeout(std::time::Duration::from_secs(0))
        .build()
        .map_err(|e| e.to_string())?;

    let r = cliente
        .get(m.url)
        .send()
        .await
        .map_err(|e| format!("descarga fallida: {e}"))?;
    if !r.status().is_success() {
        return Err(format!("descarga fallida: HTTP {}", r.status()));
    }
    let bytes = r.bytes().await.map_err(|e| e.to_string())?;

    let tmp = destino.with_extension("tmp");
    std::fs::write(&tmp, &bytes).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, &destino).map_err(|e| e.to_string())?;
    tracing::info!("modelo {} listo ({} bytes)", m.archivo, bytes.len());
    Ok(destino)
}

/// Sesión de ONNX cacheada.
///
/// Cargar isnetis cuesta ~1 s y 168 MB de memoria, así que se hace una sola vez
/// y se reutiliza. `Session::run` necesita `&mut`, de ahí el mutex: estos
/// comandos son esporádicos y serializarlos no molesta a nadie — y en cambio
/// dos inferencias a la vez sí duplicarían el pico de memoria.
type SesionCacheada = OnceLock<Mutex<Session>>;

static S_ISNETIS: SesionCacheada = OnceLock::new();
static S_ANIMEGAN: SesionCacheada = OnceLock::new();

fn abrir(cache: &'static SesionCacheada, ruta: &Path) -> Result<&'static Mutex<Session>, String> {
    if let Some(s) = cache.get() {
        return Ok(s);
    }
    let sesion = Session::builder()
        .map_err(|e| e.to_string())?
        .commit_from_file(ruta)
        .map_err(|e| format!("no se pudo cargar {}: {e}", ruta.display()))?;
    // Si dos peticiones llegan a la vez, una gana y la otra descarta su sesión;
    // es más barato que un candado alrededor de la carga entera.
    Ok(cache.get_or_init(|| Mutex::new(sesion)))
}

// ── Utilidades de tensores ───────────────────────────────────────────────────

/// Imagen RGB a tensor NCHW con valores en [0, 1].
fn a_tensor(img: &RgbImage) -> Array4<f32> {
    let (w, h) = (img.width() as usize, img.height() as usize);
    let mut t = Array4::<f32>::zeros((1, 3, h, w));
    for (x, y, p) in img.enumerate_pixels() {
        let (x, y) = (x as usize, y as usize);
        t[[0, 0, y, x]] = f32::from(p[0]) / 255.0;
        t[[0, 1, y, x]] = f32::from(p[1]) / 255.0;
        t[[0, 2, y, x]] = f32::from(p[2]) / 255.0;
    }
    t
}

fn u8_desde(v: f32) -> u8 {
    (v * 255.0).clamp(0.0, 255.0) as u8
}

// ── Quitar el fondo (isnetis) ────────────────────────────────────────────────

/// Recorte y relleno que aplica isnetis, para poder deshacerlo sobre la máscara.
struct Encuadre {
    w: u32,
    h: u32,
    off_x: u32,
    off_y: u32,
}

/// Escala la imagen para que entre en un cuadrado de `lado` conservando la
/// proporción, y la centra con relleno negro.
///
/// Es lo que hace `get_isnetis_mask` en imgutils, y la posición importa: la
/// máscara sale en coordenadas de ESTE encuadre, así que para devolverla al
/// tamaño original hay que recortar exactamente la misma región.
fn encuadrar(img: &RgbImage, lado: u32) -> (RgbImage, Encuadre) {
    let (w0, h0) = (img.width(), img.height());
    let (w, h) = if h0 > w0 {
        ((lado * w0 / h0).max(1), lado)
    } else {
        (lado, (lado * h0 / w0).max(1))
    };

    let escalada = image::imageops::resize(img, w, h, FilterType::Triangle);
    let mut lienzo = RgbImage::new(lado, lado);
    let (off_x, off_y) = ((lado - w) / 2, (lado - h) / 2);
    image::imageops::overlay(&mut lienzo, &escalada, i64::from(off_x), i64::from(off_y));

    (lienzo, Encuadre { w, h, off_x, off_y })
}

pub fn quitar_fondo(
    png_o_jpeg: &[u8],
    fondo_blanco: bool,
) -> Result<(Vec<u8>, &'static str), String> {
    let img =
        image::load_from_memory(png_o_jpeg).map_err(|e| format!("no se pudo decodificar: {e}"))?;
    let (w0, h0) = (img.width(), img.height());
    let rgb = img.to_rgb8();

    let (entrada, enc) = encuadrar(&rgb, ISNETIS_LADO);
    let tensor = a_tensor(&entrada);

    let ruta = dir_modelos().join(ISNETIS.archivo);
    let sesion = abrir(&S_ISNETIS, &ruta)?;
    let salida = {
        let mut s = sesion.lock().map_err(|e| e.to_string())?;
        let entradas = ort::inputs!["img" => ort::value::TensorRef::from_array_view(&tensor)
            .map_err(|e| e.to_string())?];
        let r = s
            .run(entradas)
            .map_err(|e| format!("inferencia fallida: {e}"))?;
        let (forma, datos) = r["mask"]
            .try_extract_tensor::<f32>()
            .map_err(|e| e.to_string())?;
        // Se copia porque el resultado muere con `r` al salir del bloque.
        let v: Vec<usize> = forma.iter().map(|d| *d as usize).collect();
        ArrayView4::from_shape((v[0], v[1], v[2], v[3]), datos)
            .map_err(|e| e.to_string())?
            .to_owned()
    };

    // Deshacer el encuadre: recortar la región útil y volver al tamaño original.
    let mut mascara = image::GrayImage::new(enc.w, enc.h);
    for y in 0..enc.h {
        for x in 0..enc.w {
            let v = salida[[0, 0, (y + enc.off_y) as usize, (x + enc.off_x) as usize]];
            mascara.put_pixel(x, y, image::Luma([u8_desde(v)]));
        }
    }
    let mascara = image::imageops::resize(&mascara, w0, h0, FilterType::Triangle);

    // Con fondo blanco se mezcla y sale JPEG; transparente sale PNG, que es el
    // único de los dos que guarda canal alfa.
    if fondo_blanco {
        let mut out = RgbImage::new(w0, h0);
        for (x, y, p) in out.enumerate_pixels_mut() {
            let a = f32::from(mascara.get_pixel(x, y)[0]) / 255.0;
            let o = rgb.get_pixel(x, y).0;
            *p = image::Rgb([
                u8_desde(f32::from(o[0]) / 255.0 * a + (1.0 - a)),
                u8_desde(f32::from(o[1]) / 255.0 * a + (1.0 - a)),
                u8_desde(f32::from(o[2]) / 255.0 * a + (1.0 - a)),
            ]);
        }
        // El códec propio en C y Zig (jpeg.rs), 3,35x más rápido que el
        // del crate `image` que se usaba acá.
        Ok((crate::jpeg::codificar(&out, crate::jpeg::CALIDAD), "jpeg"))
    } else {
        let mut out = RgbaImage::new(w0, h0);
        for (x, y, p) in out.enumerate_pixels_mut() {
            let o = rgb.get_pixel(x, y).0;
            *p = image::Rgba([o[0], o[1], o[2], mascara.get_pixel(x, y)[0]]);
        }
        let mut png = Vec::new();
        DynamicImage::ImageRgba8(out)
            .write_to(&mut std::io::Cursor::new(&mut png), image::ImageFormat::Png)
            .map_err(|e| e.to_string())?;
        Ok((png, "png"))
    }
}

// ── Estilo anime (AnimeGANv2) ────────────────────────────────────────────────

pub fn a_estilo_anime(png_o_jpeg: &[u8]) -> Result<Vec<u8>, String> {
    let img =
        image::load_from_memory(png_o_jpeg).map_err(|e| format!("no se pudo decodificar: {e}"))?;
    let (w0, h0) = (img.width(), img.height());

    // El export ONNX tiene forma fija, así que se deforma a 512x512 y al final
    // se vuelve a la proporción original. El modelo es de retratos y se entrenó
    // a ese tamaño, con lo cual no se pierde nada frente a la versión PyTorch.
    let entrada = image::imageops::resize(
        &img.to_rgb8(),
        ANIMEGAN_LADO,
        ANIMEGAN_LADO,
        FilterType::Lanczos3,
    );

    // El modelo espera [-1, 1], no [0, 1]: es el `* 2 - 1` del código original.
    let mut tensor = a_tensor(&entrada);
    tensor.mapv_inplace(|v| v * 2.0 - 1.0);

    let ruta = dir_modelos().join(ANIMEGAN.archivo);
    let sesion = abrir(&S_ANIMEGAN, &ruta)?;
    let salida = {
        let mut s = sesion.lock().map_err(|e| e.to_string())?;
        let entradas = ort::inputs!["input_image" => ort::value::TensorRef::from_array_view(&tensor)
            .map_err(|e| e.to_string())?];
        let r = s
            .run(entradas)
            .map_err(|e| format!("inferencia fallida: {e}"))?;
        let (forma, datos) = r["output_image"]
            .try_extract_tensor::<f32>()
            .map_err(|e| e.to_string())?;
        let v: Vec<usize> = forma.iter().map(|d| *d as usize).collect();
        ArrayView4::from_shape((v[0], v[1], v[2], v[3]), datos)
            .map_err(|e| e.to_string())?
            .to_owned()
    };

    // Y vuelve de [-1, 1] a [0, 1]: el `out * 0.5 + 0.5` del original.
    let mut out = RgbImage::new(ANIMEGAN_LADO, ANIMEGAN_LADO);
    for (x, y, p) in out.enumerate_pixels_mut() {
        let (x, y) = (x as usize, y as usize);
        *p = image::Rgb([
            u8_desde(salida[[0, 0, y, x]] * 0.5 + 0.5),
            u8_desde(salida[[0, 1, y, x]] * 0.5 + 0.5),
            u8_desde(salida[[0, 2, y, x]] * 0.5 + 0.5),
        ]);
    }
    let out = image::imageops::resize(&out, w0, h0, FilterType::Lanczos3);

    // JPEG y no PNG: WhatsApp recomprime a JPEG lo que se le manda (ver jpeg.rs).
    Ok(crate::jpeg::codificar(&out, crate::jpeg::CALIDAD))
}

// ── Anime4K ──────────────────────────────────────────────────────────────────
//
// Los kernels viven en `anime4k.rs`, con sus versiones en C y en Zig.

/// Anime4K. Devuelve la imagen en crudo, sin codificar: el handler la pasa a
/// JPEG, y los tests miran píxeles exactos, que con JPEG no podrían.
pub fn upscale(
    png_o_jpeg: &[u8],
    escala: u32,
) -> Result<(RgbImage, (u32, u32), (u32, u32)), String> {
    let escala = escala.clamp(2, 4);
    let img =
        image::load_from_memory(png_o_jpeg).map_err(|e| format!("no se pudo decodificar: {e}"))?;
    let (w0, h0) = (img.width(), img.height());
    let (w, h) = (w0 * escala, h0 * escala);

    if u64::from(w) * u64::from(h) > A4K_MAX_PIXELES_SALIDA {
        return Err(format!(
            "la salida sería de {w}x{h}, demasiado grande; probá con una imagen menor o escala 2",
        ));
    }

    // CatmullRom es la bicúbica del crate `image`, que es lo que pide el
    // algoritmo (cv2.INTER_CUBIC en la referencia).
    // Con la feature `native`, en Zig: pasadas fusionadas, SIMD y todos los
    // núcleos, idéntico bit a bit al crate (ver resize.rs).
    let mut buf = crate::resize::catmullrom_rgba(&img.to_rgba8(), w, h);

    for _ in 0..A4K_PASADAS {
        anime4k::luminancia_en_alfa(&mut buf);
        buf = anime4k::push_color(&buf, A4K_FUERZA_COLOR);
        buf = anime4k::gradiente(&buf);
        buf = anime4k::push_gradient(&buf, A4K_FUERZA_GRADIENTE);
    }

    // El alfa se usó de borrador todo el tiempo; sin esto la imagen saldría con
    // transparencias donde quedaron los bordes.
    let rgb = anime4k::sin_alfa(&buf);

    Ok((rgb, (w0, h0), (w, h)))
}

// ── Handlers ─────────────────────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct ImagenRequest {
    pub image: String,
    /// Solo para removebg: "white" pega sobre blanco, cualquier otra cosa deja
    /// el fondo transparente.
    #[serde(default)]
    pub bg: Option<String>,
    /// Solo para upscale: 2 o 4.
    #[serde(default)]
    pub scale: Option<u32>,
}

fn decodificar(b64: &str) -> Result<Vec<u8>, String> {
    B64.decode(b64.as_bytes())
        .map_err(|e| format!("base64 inválido: {e}"))
}

/// POST /vision/removebg
pub async fn removebg(
    State(_state): State<AppState>,
    Json(req): Json<ImagenRequest>,
) -> Json<serde_json::Value> {
    let bytes = match decodificar(&req.image) {
        Ok(b) => b,
        Err(e) => return Json(serde_json::json!({ "success": false, "error": e })),
    };
    if let Err(e) = asegurar_modelo(&ISNETIS).await {
        return Json(serde_json::json!({ "success": false, "error": e }));
    }
    let blanco = req.bg.as_deref() == Some("white");

    match tokio::task::spawn_blocking(move || quitar_fondo(&bytes, blanco)).await {
        Ok(Ok((datos, fmt))) => Json(serde_json::json!({
            "success": true, "image": B64.encode(&datos), "format": fmt,
        })),
        Ok(Err(e)) => Json(serde_json::json!({ "success": false, "error": e })),
        Err(e) => Json(serde_json::json!({ "success": false, "error": e.to_string() })),
    }
}

/// POST /vision/toanime
pub async fn toanime(
    State(_state): State<AppState>,
    Json(req): Json<ImagenRequest>,
) -> Json<serde_json::Value> {
    let bytes = match decodificar(&req.image) {
        Ok(b) => b,
        Err(e) => return Json(serde_json::json!({ "success": false, "error": e })),
    };
    if let Err(e) = asegurar_modelo(&ANIMEGAN).await {
        return Json(serde_json::json!({ "success": false, "error": e }));
    }

    match tokio::task::spawn_blocking(move || a_estilo_anime(&bytes)).await {
        Ok(Ok(png)) => Json(serde_json::json!({
            "success": true, "image": B64.encode(&png), "format": "jpeg",
        })),
        Ok(Err(e)) => Json(serde_json::json!({ "success": false, "error": e })),
        Err(e) => Json(serde_json::json!({ "success": false, "error": e.to_string() })),
    }
}

/// POST /vision/upscale
///
/// A diferencia de los otros dos no baja ningún modelo: Anime4K es un
/// algoritmo, no una red.
pub async fn upscale_handler(
    State(_state): State<AppState>,
    Json(req): Json<ImagenRequest>,
) -> Json<serde_json::Value> {
    let bytes = match decodificar(&req.image) {
        Ok(b) => b,
        Err(e) => return Json(serde_json::json!({ "success": false, "error": e })),
    };
    let escala = req.scale.unwrap_or(2);

    // JPEG y no PNG: WhatsApp recomprime a JPEG lo que se le manda, y el
    // códec propio en C y Zig es además más rápido que el PNG (ver jpeg.rs).
    let codificado = move || {
        upscale(&bytes, escala)
            .map(|(img, o, r)| (crate::jpeg::codificar(&img, crate::jpeg::CALIDAD), o, r))
    };
    match tokio::task::spawn_blocking(codificado).await {
        Ok(Ok((jpeg, orig, res))) => Json(serde_json::json!({
            "success":  true,
            "image":    B64.encode(&jpeg),
            "format":   "jpeg",
            "scale":    escala,
            "original": { "w": orig.0, "h": orig.1 },
            "result":   { "w": res.0,  "h": res.1 },
        })),
        Ok(Err(e)) => Json(serde_json::json!({ "success": false, "error": e })),
        Err(e) => Json(serde_json::json!({ "success": false, "error": e.to_string() })),
    }
}

// ── Tests ────────────────────────────────────────────────────────────────────
//
// Las partes que dependen de un modelo ONNX no se prueban aca: necesitarian
// bajar 168 MB y el resultado es una red neuronal, no algo que se pueda afirmar
// con un assert. Lo que si se prueba es todo lo que las rodea —el encuadre, la
// conversion a tensor, los limites— y Anime4K entero, que es un algoritmo
// cerrado y deterministico.

#[cfg(test)]
mod tests {
    use super::*;
    use crate::anime4k::{luminancia, redondear};

    fn png_plano(w: u32, h: u32, color: [u8; 3]) -> Vec<u8> {
        let mut img = RgbImage::new(w, h);
        for p in img.pixels_mut() {
            *p = image::Rgb(color);
        }
        let mut buf = Vec::new();
        DynamicImage::ImageRgb8(img)
            .write_to(&mut std::io::Cursor::new(&mut buf), image::ImageFormat::Png)
            .unwrap();
        buf
    }

    /// Una linea negra vertical sobre fondo claro: el caso que Anime4K esta
    /// hecho para mejorar.
    fn png_con_linea(w: u32, h: u32) -> Vec<u8> {
        let mut img = RgbImage::new(w, h);
        for (x, _y, p) in img.enumerate_pixels_mut() {
            *p = if x == w / 2 {
                image::Rgb([20, 20, 20])
            } else {
                image::Rgb([230, 230, 230])
            };
        }
        let mut buf = Vec::new();
        DynamicImage::ImageRgb8(img)
            .write_to(&mut std::io::Cursor::new(&mut buf), image::ImageFormat::Png)
            .unwrap();
        buf
    }

    // ── Encuadre de isnetis ─────────────────────────────────────────────────

    #[test]
    fn el_encuadre_conserva_la_proporcion_y_centra() {
        // Apaisada: el ancho llega al lado y la altura queda proporcional.
        let (lienzo, enc) = encuadrar(&RgbImage::new(200, 100), 1024);
        assert_eq!(
            (lienzo.width(), lienzo.height()),
            (1024, 1024),
            "siempre cuadrado"
        );
        assert_eq!(enc.w, 1024);
        assert_eq!(enc.h, 512, "la mitad de ancho, la mitad de alto");
        assert_eq!(enc.off_x, 0);
        assert_eq!(enc.off_y, 256, "centrada verticalmente");
    }

    #[test]
    fn el_encuadre_funciona_igual_en_vertical() {
        let (_, enc) = encuadrar(&RgbImage::new(100, 200), 1024);
        assert_eq!(enc.h, 1024);
        assert_eq!(enc.w, 512);
        assert_eq!(enc.off_x, 256);
        assert_eq!(enc.off_y, 0);
    }

    #[test]
    fn el_encuadre_de_una_imagen_cuadrada_no_deja_relleno() {
        let (_, enc) = encuadrar(&RgbImage::new(300, 300), 1024);
        assert_eq!((enc.w, enc.h), (1024, 1024));
        assert_eq!((enc.off_x, enc.off_y), (0, 0));
    }

    #[test]
    fn el_encuadre_no_colapsa_una_imagen_muy_alargada() {
        // 2000x1 escalado a 1024 daria altura 0 por division entera, y un
        // resize a 0 px entra en panico.
        let (_, enc) = encuadrar(&RgbImage::new(2000, 1), 1024);
        assert!(enc.h >= 1, "la altura no puede quedar en 0");
        assert!(enc.w >= 1);
    }

    // ── Conversion a tensor ─────────────────────────────────────────────────

    #[test]
    fn el_tensor_normaliza_y_ordena_en_nchw() {
        let mut img = RgbImage::new(2, 1);
        img.put_pixel(0, 0, image::Rgb([255, 0, 0]));
        img.put_pixel(1, 0, image::Rgb([0, 128, 255]));

        let t = a_tensor(&img);
        assert_eq!(t.shape(), &[1, 3, 1, 2], "forma NCHW");
        assert_eq!(t[[0, 0, 0, 0]], 1.0, "rojo del primer pixel");
        assert_eq!(t[[0, 1, 0, 0]], 0.0);
        assert_eq!(t[[0, 2, 0, 1]], 1.0, "azul del segundo pixel");
        assert!((t[[0, 1, 0, 1]] - 128.0 / 255.0).abs() < 1e-6);
    }

    #[test]
    fn u8_desde_acota_en_los_dos_extremos() {
        assert_eq!(u8_desde(0.0), 0);
        assert_eq!(u8_desde(1.0), 255);
        assert_eq!(u8_desde(-5.0), 0, "no debe desbordar por abajo");
        assert_eq!(u8_desde(5.0), 255, "ni por arriba");
    }

    // ── Anime4K ─────────────────────────────────────────────────────────────

    #[test]
    fn redondear_se_comporta_como_el_unfloat_original() {
        assert_eq!(redondear(0.0), 0);
        assert_eq!(redondear(0.4), 0);
        assert_eq!(redondear(0.5), 1, "0.5 redondea hacia arriba");
        assert_eq!(redondear(254.6), 255);
        assert_eq!(redondear(-10.0), 0);
        assert_eq!(redondear(300.0), 255);
    }

    #[test]
    fn la_luminancia_usa_los_coeficientes_bt601() {
        assert_eq!(luminancia(&image::Rgba([0, 0, 0, 0])), 0);
        assert_eq!(luminancia(&image::Rgba([255, 255, 255, 0])), 255);
        // El verde pesa mas que el rojo, y el rojo mas que el azul.
        let r = luminancia(&image::Rgba([255, 0, 0, 0]));
        let g = luminancia(&image::Rgba([0, 255, 0, 0]));
        let b = luminancia(&image::Rgba([0, 0, 255, 0]));
        assert!(g > r && r > b, "r={r} g={g} b={b}");
    }

    #[test]
    fn el_upscale_multiplica_el_tamano() {
        let (_, orig, res) = upscale(&png_plano(50, 30, [200, 100, 50]), 2).unwrap();
        assert_eq!(orig, (50, 30));
        assert_eq!(res, (100, 60));

        let (_, _, res4) = upscale(&png_plano(50, 30, [200, 100, 50]), 4).unwrap();
        assert_eq!(res4, (200, 120));
    }

    #[test]
    fn la_escala_se_acota_a_2_o_4() {
        // Fuera de rango no deberia fallar, sino quedarse en el limite.
        let (_, _, res) = upscale(&png_plano(10, 10, [1, 2, 3]), 99).unwrap();
        assert_eq!(res, (40, 40), "por arriba se acota a 4");
        let (_, _, res) = upscale(&png_plano(10, 10, [1, 2, 3]), 1).unwrap();
        assert_eq!(res, (20, 20), "por abajo, a 2");
    }

    #[test]
    fn la_salida_no_queda_transparente() {
        // El alfa se usa de borrador durante todo el algoritmo; si no se
        // descartara al final, la imagen saldria con transparencias justo en
        // los bordes, que es donde mas se nota.
        // Lo que se manda es JPEG, que no tiene alfa; se comprueba de punta a
        // punta, decodificando lo que se mandaría.
        let (img, _, _) = upscale(&png_con_linea(40, 40), 2).unwrap();
        let jpeg = crate::jpeg::codificar(&img, crate::jpeg::CALIDAD);
        let dec = image::load_from_memory(&jpeg).unwrap();
        assert!(
            !dec.color().has_alpha(),
            "la salida debe ser RGB, sin canal alfa"
        );
    }

    #[test]
    fn un_color_plano_sigue_plano_despues_del_upscale() {
        // Sin bordes que empujar, el algoritmo no deberia inventar nada.
        let (img, _, _) = upscale(&png_plano(40, 40, [120, 60, 30]), 2).unwrap();
        for p in img.pixels() {
            let d = |a: u8, b: u8| (i32::from(a) - i32::from(b)).abs();
            assert!(
                d(p[0], 120) <= 2 && d(p[1], 60) <= 2 && d(p[2], 30) <= 2,
                "aparecio color donde no habia nada: {:?}",
                p.0,
            );
        }
    }

    #[test]
    fn el_upscale_marca_el_borde_mas_que_una_interpolacion() {
        // Es lo que distingue a Anime4K de un simple redimensionado: en el
        // borde, el contraste entre pixeles vecinos tiene que ser al menos tan
        // marcado como el que deja una bicubica sola.
        let fuente = png_con_linea(40, 40);
        let (a4k, _, _) = upscale(&fuente, 2).unwrap();

        let base = image::imageops::resize(
            &image::load_from_memory(&fuente).unwrap().to_rgb8(),
            80,
            80,
            FilterType::CatmullRom,
        );

        // Maximo salto horizontal entre pixeles contiguos, en la fila del medio.
        let salto = |img: &RgbImage| {
            (1..img.width())
                .map(|x| {
                    let a = i32::from(img.get_pixel(x, 20)[0]);
                    let b = i32::from(img.get_pixel(x - 1, 20)[0]);
                    (a - b).abs()
                })
                .max()
                .unwrap_or(0)
        };
        assert!(
            salto(&a4k) >= salto(&base),
            "Anime4K deberia dejar el borde al menos tan marcado como la bicubica: {} vs {}",
            salto(&a4k),
            salto(&base),
        );
    }

    #[test]
    fn una_salida_demasiado_grande_se_rechaza_con_un_mensaje_util() {
        // 4000x4000 a x4 son 256 millones de pixeles: hay que cortarlo ANTES de
        // reservar, no cuando ya se agoto la memoria.
        let e = upscale(&png_plano(4000, 4000, [0, 0, 0]), 4).unwrap_err();
        assert!(e.contains("demasiado grande"), "mensaje poco claro: {e}");
        assert!(e.contains("escala 2"), "deberia sugerir la salida: {e}");
    }

    #[test]
    fn una_entrada_que_no_es_imagen_da_error_y_no_panic() {
        assert!(upscale(b"esto no es una imagen", 2).is_err());
        assert!(upscale(&[], 2).is_err());
        assert!(a_estilo_anime(b"tampoco").is_err());
        assert!(quitar_fondo(b"ni esto", false).is_err());
    }
}
