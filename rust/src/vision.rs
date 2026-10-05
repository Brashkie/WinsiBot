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
    url:     &'static str,
    /// Para avisar en el log antes de empezar una descarga larga.
    mb:      u32,
}

const ISNETIS: Modelo = Modelo {
    archivo: "isnetis.onnx",
    url:     "https://huggingface.co/skytnt/anime-seg/resolve/main/isnetis.onnx",
    mb:      168,
};

const ANIMEGAN: Modelo = Modelo {
    archivo: "face_paint_512_v2.onnx",
    url:     "https://huggingface.co/akhaliq/AnimeGANv2-ONNX/resolve/main/face_paint_512_v2_0.onnx",
    mb:      8,
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

    std::fs::create_dir_all(&dir).map_err(|e| format!("no se pudo crear {}: {e}", dir.display()))?;
    tracing::info!("descargando modelo {} ({} MB), solo la primera vez", m.archivo, m.mb);

    let cliente = reqwest::Client::builder()
        // Sin timeout total: 168 MB en una conexión lenta pueden tardar mucho y
        // cortar a la mitad obligaría a empezar de cero.
        .timeout(std::time::Duration::from_secs(0))
        .build()
        .map_err(|e| e.to_string())?;

    let r = cliente.get(m.url).send().await.map_err(|e| format!("descarga fallida: {e}"))?;
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

static S_ISNETIS:  SesionCacheada = OnceLock::new();
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

pub fn quitar_fondo(png_o_jpeg: &[u8], fondo_blanco: bool) -> Result<(Vec<u8>, &'static str), String> {
    let img = image::load_from_memory(png_o_jpeg)
        .map_err(|e| format!("no se pudo decodificar: {e}"))?;
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
        let r = s.run(entradas).map_err(|e| format!("inferencia fallida: {e}"))?;
        let (forma, datos) = r["mask"].try_extract_tensor::<f32>().map_err(|e| e.to_string())?;
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
        let mut jpeg = Vec::new();
        image::codecs::jpeg::JpegEncoder::new_with_quality(std::io::Cursor::new(&mut jpeg), 90)
            .encode_image(&DynamicImage::ImageRgb8(out))
            .map_err(|e| e.to_string())?;
        Ok((jpeg, "jpeg"))
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
    let img = image::load_from_memory(png_o_jpeg)
        .map_err(|e| format!("no se pudo decodificar: {e}"))?;
    let (w0, h0) = (img.width(), img.height());

    // El export ONNX tiene forma fija, así que se deforma a 512x512 y al final
    // se vuelve a la proporción original. El modelo es de retratos y se entrenó
    // a ese tamaño, con lo cual no se pierde nada frente a la versión PyTorch.
    let entrada = image::imageops::resize(&img.to_rgb8(), ANIMEGAN_LADO, ANIMEGAN_LADO, FilterType::Lanczos3);

    // El modelo espera [-1, 1], no [0, 1]: es el `* 2 - 1` del código original.
    let mut tensor = a_tensor(&entrada);
    tensor.mapv_inplace(|v| v * 2.0 - 1.0);

    let ruta = dir_modelos().join(ANIMEGAN.archivo);
    let sesion = abrir(&S_ANIMEGAN, &ruta)?;
    let salida = {
        let mut s = sesion.lock().map_err(|e| e.to_string())?;
        let entradas = ort::inputs!["input_image" => ort::value::TensorRef::from_array_view(&tensor)
            .map_err(|e| e.to_string())?];
        let r = s.run(entradas).map_err(|e| format!("inferencia fallida: {e}"))?;
        let (forma, datos) = r["output_image"].try_extract_tensor::<f32>().map_err(|e| e.to_string())?;
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

    let mut png = Vec::new();
    DynamicImage::ImageRgb8(out)
        .write_to(&mut std::io::Cursor::new(&mut png), image::ImageFormat::Png)
        .map_err(|e| e.to_string())?;
    Ok(png)
}

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
const A4K_PASADAS: usize = 2;
/// De 0 a 1. Más alto, líneas más finas.
const A4K_FUERZA_COLOR: f32 = 1.0 / 3.0;
/// De 0 a 1. Más alto, bordes más marcados.
const A4K_FUERZA_GRADIENTE: f32 = 1.0;

/// Techo de píxeles de SALIDA. Un x4 sobre una foto grande son cientos de
/// millones de operaciones y varios cientos de MB; el límite va sobre el
/// resultado, que es lo que de verdad cuesta.
const A4K_MAX_PIXELES_SALIDA: u64 = 16_000_000;

/// Luminancia BT.601, la misma constante que usa la referencia.
fn luminancia(p: &image::Rgba<u8>) -> u8 {
    let v = 0.299 * f32::from(p[0]) + 0.587 * f32::from(p[1]) + 0.114 * f32::from(p[2]);
    redondear(v)
}

/// Pasa un flotante a u8 redondeando y acotando, como el `unFloat` original.
fn redondear(n: f32) -> u8 {
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
    tl: image::Rgba<u8>, tc: image::Rgba<u8>, tr: image::Rgba<u8>,
    ml: image::Rgba<u8>,                      mr: image::Rgba<u8>,
    bl: image::Rgba<u8>, bc: image::Rgba<u8>, br: image::Rgba<u8>,
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
        tl: g(xn, yn), tc: g(x, yn), tr: g(xp, yn),
        ml: g(xn, y),                mr: g(xp, y),
        bl: g(xn, yp), bc: g(x, yp), br: g(xp, yp),
    }
}

fn maxi(a: u8, b: u8, c: u8) -> u8 { a.max(b).max(c) }
fn mini(a: u8, b: u8, c: u8) -> u8 { a.min(b).min(c) }

/// Afina las líneas empujando cada píxel hacia el lado más claro.
///
/// Los cuatro bloques (arriba/abajo, subdiagonal, izquierda/derecha, diagonal)
/// se evalúan EN CADENA sobre el mismo `mc`, así que cada uno ve el alfa que
/// dejó el anterior. Es lo que hace el original y cambiarlo altera el
/// resultado, aunque a primera vista parezca un descuido.
fn push_color(img: &image::RgbaImage, fuerza: f32) -> image::RgbaImage {
    let mut salida = img.clone();
    for y in 0..img.height() {
        for x in 0..img.width() {
            let v = vecindad(img, x, y);
            let p = img.get_pixel(x, y);
            let mut mc = [f32::from(p[0]), f32::from(p[1]), f32::from(p[2]), f32::from(p[3])];
            let a = |m: &[f32; 4]| redondear(m[3]);

            // arriba y abajo
            if mini(v.tl[3], v.tc[3], v.tr[3]) > a(&mc) && a(&mc) > maxi(v.bl[3], v.bc[3], v.br[3]) {
                empujar(&mut mc, &v.tl, &v.tc, &v.tr, fuerza, false);
            } else if mini(v.bl[3], v.bc[3], v.br[3]) > a(&mc) && a(&mc) > maxi(v.tl[3], v.tc[3], v.tr[3]) {
                empujar(&mut mc, &v.bl, &v.bc, &v.br, fuerza, false);
            }

            // subdiagonal
            if mini(v.tc[3], v.tr[3], v.mr[3]) > maxi(v.ml[3], a(&mc), v.bc[3]) {
                empujar(&mut mc, &v.tc, &v.tr, &v.mr, fuerza, false);
            } else if mini(v.ml[3], v.bl[3], v.bc[3]) > maxi(v.tc[3], a(&mc), v.mr[3]) {
                empujar(&mut mc, &v.ml, &v.bl, &v.bc, fuerza, false);
            }

            // izquierda y derecha
            if mini(v.tr[3], v.mr[3], v.br[3]) > a(&mc) && a(&mc) > maxi(v.tl[3], v.ml[3], v.bl[3]) {
                empujar(&mut mc, &v.tr, &v.mr, &v.br, fuerza, false);
            } else if mini(v.tl[3], v.ml[3], v.bl[3]) > a(&mc) && a(&mc) > maxi(v.tr[3], v.mr[3], v.br[3]) {
                empujar(&mut mc, &v.tl, &v.ml, &v.bl, fuerza, false);
            }

            // diagonal
            if mini(v.mr[3], v.br[3], v.bc[3]) > maxi(v.tc[3], a(&mc), v.ml[3]) {
                empujar(&mut mc, &v.mr, &v.br, &v.bc, fuerza, false);
            } else if mini(v.ml[3], v.tl[3], v.tc[3]) > maxi(v.bc[3], a(&mc), v.mr[3]) {
                empujar(&mut mc, &v.ml, &v.tl, &v.tc, fuerza, false);
            }

            salida.put_pixel(x, y, image::Rgba([
                redondear(mc[0]), redondear(mc[1]), redondear(mc[2]), redondear(mc[3]),
            ]));
        }
    }
    salida
}

/// Sobel sobre la luminancia, invertido y guardado en el alfa.
///
/// Se invierte (`255 - g`) para que `push_gradient` pueda reutilizar la misma
/// comparación que `push_color`: ahí "más claro" significaba más luminancia,
/// acá significa menos borde.
fn gradiente(img: &image::RgbaImage) -> image::RgbaImage {
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
fn push_gradient(img: &image::RgbaImage, fuerza: f32) -> image::RgbaImage {
    let mut salida = img.clone();
    for y in 0..img.height() {
        for x in 0..img.width() {
            let v = vecindad(img, x, y);
            let p = img.get_pixel(x, y);
            let mut mc = [f32::from(p[0]), f32::from(p[1]), f32::from(p[2]), f32::from(p[3])];
            let ma = p[3];

            let elegido = if mini(v.tl[3], v.tc[3], v.tr[3]) > ma && ma > maxi(v.bl[3], v.bc[3], v.br[3]) {
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

            salida.put_pixel(x, y, image::Rgba([
                redondear(mc[0]), redondear(mc[1]), redondear(mc[2]), redondear(mc[3]),
            ]));
        }
    }
    salida
}

pub fn upscale(png_o_jpeg: &[u8], escala: u32) -> Result<(Vec<u8>, (u32, u32), (u32, u32)), String> {
    let escala = escala.clamp(2, 4);
    let img = image::load_from_memory(png_o_jpeg)
        .map_err(|e| format!("no se pudo decodificar: {e}"))?;
    let (w0, h0) = (img.width(), img.height());
    let (w, h) = (w0 * escala, h0 * escala);

    if u64::from(w) * u64::from(h) > A4K_MAX_PIXELES_SALIDA {
        return Err(format!(
            "la salida sería de {w}x{h}, demasiado grande; probá con una imagen menor o escala 2",
        ));
    }

    // CatmullRom es la bicúbica del crate `image`, que es lo que pide el
    // algoritmo (cv2.INTER_CUBIC en la referencia).
    let mut buf = image::imageops::resize(&img.to_rgba8(), w, h, FilterType::CatmullRom);

    for _ in 0..A4K_PASADAS {
        for p in buf.pixels_mut() {
            p[3] = luminancia(p);
        }
        buf = push_color(&buf, A4K_FUERZA_COLOR);
        buf = gradiente(&buf);
        buf = push_gradient(&buf, A4K_FUERZA_GRADIENTE);
    }

    // El alfa se usó de borrador todo el tiempo; sin esto la imagen saldría con
    // transparencias donde quedaron los bordes.
    let mut rgb = RgbImage::new(w, h);
    for (x, y, p) in rgb.enumerate_pixels_mut() {
        let s = buf.get_pixel(x, y).0;
        *p = image::Rgb([s[0], s[1], s[2]]);
    }

    let mut png = Vec::new();
    DynamicImage::ImageRgb8(rgb)
        .write_to(&mut std::io::Cursor::new(&mut png), image::ImageFormat::Png)
        .map_err(|e| e.to_string())?;
    Ok((png, (w0, h0), (w, h)))
}

// ── Handlers ─────────────────────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct ImagenRequest {
    pub image: String,
    /// Solo para removebg: "white" pega sobre blanco, cualquier otra cosa deja
    /// el fondo transparente.
    #[serde(default)]
    pub bg:    Option<String>,
    /// Solo para upscale: 2 o 4.
    #[serde(default)]
    pub scale: Option<u32>,
}

fn decodificar(b64: &str) -> Result<Vec<u8>, String> {
    B64.decode(b64.as_bytes()).map_err(|e| format!("base64 inválido: {e}"))
}

/// POST /vision/removebg
pub async fn removebg(
    State(_state): State<AppState>,
    Json(req):     Json<ImagenRequest>,
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
        Err(e)     => Json(serde_json::json!({ "success": false, "error": e.to_string() })),
    }
}

/// POST /vision/toanime
pub async fn toanime(
    State(_state): State<AppState>,
    Json(req):     Json<ImagenRequest>,
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
            "success": true, "image": B64.encode(&png), "format": "png",
        })),
        Ok(Err(e)) => Json(serde_json::json!({ "success": false, "error": e })),
        Err(e)     => Json(serde_json::json!({ "success": false, "error": e.to_string() })),
    }
}

/// POST /vision/upscale
///
/// A diferencia de los otros dos no baja ningún modelo: Anime4K es un
/// algoritmo, no una red.
pub async fn upscale_handler(
    State(_state): State<AppState>,
    Json(req):     Json<ImagenRequest>,
) -> Json<serde_json::Value> {
    let bytes = match decodificar(&req.image) {
        Ok(b) => b,
        Err(e) => return Json(serde_json::json!({ "success": false, "error": e })),
    };
    let escala = req.scale.unwrap_or(2);

    match tokio::task::spawn_blocking(move || upscale(&bytes, escala)).await {
        Ok(Ok((png, orig, res))) => Json(serde_json::json!({
            "success":  true,
            "image":    B64.encode(&png),
            "format":   "png",
            "scale":    escala,
            "original": { "w": orig.0, "h": orig.1 },
            "result":   { "w": res.0,  "h": res.1 },
        })),
        Ok(Err(e)) => Json(serde_json::json!({ "success": false, "error": e })),
        Err(e)     => Json(serde_json::json!({ "success": false, "error": e.to_string() })),
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
            *p = if x == w / 2 { image::Rgb([20, 20, 20]) } else { image::Rgb([230, 230, 230]) };
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
        assert_eq!((lienzo.width(), lienzo.height()), (1024, 1024), "siempre cuadrado");
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
        let (png, _, _) = upscale(&png_con_linea(40, 40), 2).unwrap();
        let img = image::load_from_memory(&png).unwrap();
        assert!(!img.color().has_alpha(), "la salida debe ser RGB, sin canal alfa");
    }

    #[test]
    fn un_color_plano_sigue_plano_despues_del_upscale() {
        // Sin bordes que empujar, el algoritmo no deberia inventar nada.
        let (png, _, _) = upscale(&png_plano(40, 40, [120, 60, 30]), 2).unwrap();
        let img = image::load_from_memory(&png).unwrap().to_rgb8();
        for p in img.pixels() {
            let d = |a: u8, b: u8| (i32::from(a) - i32::from(b)).abs();
            assert!(
                d(p[0], 120) <= 2 && d(p[1], 60) <= 2 && d(p[2], 30) <= 2,
                "aparecio color donde no habia nada: {:?}", p.0,
            );
        }
    }

    #[test]
    fn el_upscale_marca_el_borde_mas_que_una_interpolacion() {
        // Es lo que distingue a Anime4K de un simple redimensionado: en el
        // borde, el contraste entre pixeles vecinos tiene que ser al menos tan
        // marcado como el que deja una bicubica sola.
        let fuente = png_con_linea(40, 40);
        let (png, _, _) = upscale(&fuente, 2).unwrap();
        let a4k = image::load_from_memory(&png).unwrap().to_rgb8();

        let base = image::imageops::resize(
            &image::load_from_memory(&fuente).unwrap().to_rgb8(),
            80, 80, FilterType::CatmullRom,
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
            salto(&a4k), salto(&base),
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
