//! render.rs — SVG a imagen, y convertir o redimensionar una imagen, sin sharp.
//!
//! Las tarjetas del bot —la cita de #qc, el texto de #texto, el perfil, el
//! mapa de #explorar, el tweet con foto— se arman como SVG en TypeScript.
//! Hasta la 9.3.5 sharp (libvips + librsvg, un addon .node) las pasaba a PNG o
//! JPEG; ahora es `resvg`, Rust puro, con las fuentes del sistema.
//!
//! Lo que viene del chat ya llega escapado al SVG (textImage.ts). Igual, acá
//! una `<image>` solo puede ser un `data:` —nunca un archivo del disco ni una
//! URL—: así un SVG no puede leer nada de la máquina.
//!
//! `/image/convert` es lo otro que hacía sharp: leer una imagen (PNG, JPEG,
//! WebP estático), achicarla o recortarla a un tamaño, y codificarla.

use image::RgbaImage;
use resvg::{tiny_skia, usvg};
use std::sync::{Arc, OnceLock};

/// Lo más grande que se dibuja: 4096×4096. Las tarjetas miden menos de 1000.
pub const MAX_PIXELES: u64 = 16 << 20;

/// Las fuentes del sistema, cargadas una vez, la primera vez que se usan
/// (mapeadas a memoria: no se leen enteras).
fn fuentes() -> Arc<usvg::fontdb::Database> {
    static DB: OnceLock<Arc<usvg::fontdb::Database>> = OnceLock::new();
    DB.get_or_init(|| {
        let mut db = usvg::fontdb::Database::new();
        db.load_system_fonts();
        // fontdb no conoce las de Android ni las de Termux.
        let mut extra = vec![std::path::PathBuf::from("/system/fonts")];
        if let Some(prefijo) = std::env::var_os("PREFIX") {
            extra.push(std::path::PathBuf::from(prefijo).join("share/fonts"));
        }
        // WINSI_FUENTES: una carpeta con fuentes propias.
        if let Some(dir) = std::env::var_os("WINSI_FUENTES") {
            extra.push(dir.into());
        }
        for dir in extra.iter().filter(|d| d.is_dir()) {
            db.load_fonts_dir(dir);
        }
        // "sans-serif" a secas: la primera que haya de estas.
        let hay = |f: &str| db.faces().any(|c| c.families.iter().any(|(n, _)| n == f));
        if let Some(f) = [
            "Arial",
            "Roboto",
            "DejaVu Sans",
            "Noto Sans",
            "Liberation Sans",
        ]
        .into_iter()
        .find(|f| hay(f))
        {
            db.set_sans_serif_family(f);
        }
        tracing::info!("[render] {} fuentes cargadas", db.len());
        Arc::new(db)
    })
    .clone()
}

/// Cuántas fuentes hay (para el log y los tests).
pub fn cuantas_fuentes() -> usize {
    fuentes().len()
}

fn opciones() -> usvg::Options<'static> {
    usvg::Options {
        fontdb: fuentes(),
        font_family: "sans-serif".into(),
        image_href_resolver: usvg::ImageHrefResolver {
            resolve_data: usvg::ImageHrefResolver::default_data_resolver(),
            // Nada de archivos ni URLs: solo `data:`.
            resolve_string: Box::new(|_, _| None),
        },
        font_resolver: usvg::FontResolver {
            select_font: usvg::FontResolver::default_font_selector(),
            select_fallback: Box::new(respaldo),
        },
        ..Default::default()
    }
}

/// Si la fuente tiene el carácter, por su tabla `cmap` (como usvg por dentro).
fn tiene(db: &usvg::fontdb::Database, id: usvg::fontdb::ID, c: char) -> bool {
    db.with_face_data(id, |datos, indice| {
        let fuente = skrifa::FontRef::from_index(datos, indice).ok()?;
        skrifa::charmap::Charmap::new(&fuente).map(c)
    })
    .flatten()
    .is_some()
}

/// Las fuentes de símbolos y emojis, sin serifa, en el orden en que se
/// prueban como respaldo: Windows, Linux y Android. Monocromas antes que en
/// color, como las dibujaba sharp.
const RESPALDOS: [&str; 8] = [
    "Segoe UI Symbol",
    "DejaVu Sans",
    "Noto Sans Symbols 2",
    "Noto Sans Symbols",
    "Segoe UI Emoji",
    "Noto Color Emoji",
    "Noto Sans",
    "Roboto",
];

/// La fuente para un carácter que la del texto no tiene (un ⚔, un emoji).
///
/// La de usvg toma la primera fuente instalada que lo tenga y, si esa tiene
/// también todo lo demás del texto, pasa el renglón ENTERO a ella: en Windows,
/// "♡ Pareja: Leo" salía todo con serifa. Acá se prueban primero
/// [`RESPALDOS`], todas sin serifa: si la elegida tiene todo el renglón, queda
/// en ella y se ve parecido; si solo tiene el símbolo —las Noto Symbols de
/// Android—, tapa nada más el hueco. Después, cualquiera sin letras latinas,
/// que también tapa solo el hueco; y si no, la de usvg.
///
/// Se recuerda por carácter: las fuentes no cambian mientras corre.
fn respaldo(
    c: char,
    usadas: &[usvg::fontdb::ID],
    db: &mut Arc<usvg::fontdb::Database>,
) -> Option<usvg::fontdb::ID> {
    use std::collections::HashMap;
    use std::sync::Mutex;
    static MEMORIA: OnceLock<Mutex<HashMap<char, Option<usvg::fontdb::ID>>>> = OnceLock::new();
    let memoria = MEMORIA.get_or_init(Default::default);
    let elegida = *memoria
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .entry(c)
        .or_insert_with(|| elegir_respaldo(db, c));
    match elegida {
        Some(id) if !usadas.contains(&id) => Some(id),
        _ => (usvg::FontResolver::default_fallback_selector())(c, usadas, db),
    }
}

fn elegir_respaldo(db: &usvg::fontdb::Database, c: char) -> Option<usvg::fontdb::ID> {
    use usvg::fontdb::{Style, Weight};
    let normal =
        |f: &&usvg::fontdb::FaceInfo| f.style == Style::Normal && f.weight == Weight::NORMAL;
    RESPALDOS
        .iter()
        .find_map(|familia| {
            let de_la_familia = || {
                db.faces()
                    .filter(|f| f.families.iter().any(|(n, _)| n == familia))
            };
            de_la_familia()
                .filter(normal)
                .chain(de_la_familia())
                .find(|f| tiene(db, f.id, c))
                .map(|f| f.id)
        })
        .or_else(|| {
            db.faces()
                .find(|f| tiene(db, f.id, c) && !tiene(db, f.id, 'a'))
                .map(|f| f.id)
        })
}

/// Un SVG a RGBA (sin premultiplicar).
pub fn svg_a_rgba(svg: &[u8]) -> Result<RgbaImage, String> {
    let arbol =
        usvg::Tree::from_data(svg, &opciones()).map_err(|e| format!("SVG inválido: {e}"))?;
    let tam = arbol.size().to_int_size();
    let (w, h) = (tam.width(), tam.height());
    if u64::from(w) * u64::from(h) > MAX_PIXELES {
        return Err(format!("demasiado grande: {w}x{h}"));
    }
    let mut lienzo = tiny_skia::Pixmap::new(w, h).ok_or("tamaño inválido")?;
    resvg::render(
        &arbol,
        tiny_skia::Transform::default(),
        &mut lienzo.as_mut(),
    );
    // tiny-skia trabaja en alfa premultiplicado.
    let mut img = RgbaImage::from_raw(w, h, lienzo.take()).ok_or("tamaño inválido")?;
    crate::sticker::despremultiplicar(&mut img);
    Ok(img)
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Formato {
    Png,
    Jpeg,
    Webp,
}

impl Formato {
    fn mime(self) -> &'static str {
        match self {
            Formato::Png => "image/png",
            Formato::Jpeg => "image/jpeg",
            Formato::Webp => "image/webp",
        }
    }
}

/// RGBA a PNG, JPEG (el códec propio, ver jpeg.rs; sin alfa) o WebP.
pub fn codificar(img: &RgbaImage, formato: Formato, calidad: u8) -> Result<Vec<u8>, String> {
    match formato {
        Formato::Jpeg => Ok(crate::jpeg::codificar_rgba(img, calidad.clamp(1, 100))),
        Formato::Webp => crate::sticker::codificar_webp(img, f32::from(calidad)),
        Formato::Png => {
            use image::codecs::png::{CompressionType, FilterType, PngEncoder};
            let mut v = Vec::new();
            // Rápida: WhatsApp recomprime lo que recibe, y un sticker se pasa
            // a WebP después.
            let enc =
                PngEncoder::new_with_quality(&mut v, CompressionType::Fast, FilterType::Adaptive);
            img.write_with_encoder(enc).map_err(|e| e.to_string())?;
            Ok(v)
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Ajuste {
    /// Entra entera, con su proporción, sin agrandar.
    Inside,
    /// Cubre todo el tamaño pedido, recortando lo que sobra al centro.
    Cover,
}

/// La imagen a `ancho`×`alto` según `ajuste`.
pub fn ajustar(img: RgbaImage, ancho: u32, alto: u32, ajuste: Ajuste) -> RgbaImage {
    let (w, h) = img.dimensions();
    if ancho == 0 || alto == 0 || w == 0 || h == 0 {
        return img;
    }
    match ajuste {
        Ajuste::Inside => {
            if w <= ancho && h <= alto {
                return img;
            }
            let s = (f64::from(ancho) / f64::from(w)).min(f64::from(alto) / f64::from(h));
            let nw = ((f64::from(w) * s).round() as u32).clamp(1, ancho);
            let nh = ((f64::from(h) * s).round() as u32).clamp(1, alto);
            crate::sticker::redimensionar(img, nw, nh)
        }
        Ajuste::Cover => {
            let s = (f64::from(ancho) / f64::from(w)).max(f64::from(alto) / f64::from(h));
            let nw = ((f64::from(w) * s).round() as u32).max(ancho);
            let nh = ((f64::from(h) * s).round() as u32).max(alto);
            let r = crate::sticker::redimensionar(img, nw, nh);
            if (nw, nh) == (ancho, alto) {
                return r;
            }
            image::imageops::crop_imm(&r, (nw - ancho) / 2, (nh - alto) / 2, ancho, alto).to_image()
        }
    }
}

// ── Endpoints ────────────────────────────────────────────────────────────────

use axum::{
    body::Bytes,
    extract::{DefaultBodyLimit, Query},
    http::{header, StatusCode},
    response::{IntoResponse, Response},
    routing::{post, MethodRouter},
};
use serde::Deserialize;

#[derive(Deserialize)]
pub struct Salida {
    formato: Option<Formato>,
    calidad: Option<u8>,
    ancho: Option<u32>,
    alto: Option<u32>,
    ajuste: Option<Ajuste>,
}

async fn responder(
    f: impl FnOnce() -> Result<(Vec<u8>, Formato), String> + Send + 'static,
) -> Response {
    match tokio::task::spawn_blocking(f).await {
        Ok(Ok((datos, formato))) => {
            ([(header::CONTENT_TYPE, formato.mime())], datos).into_response()
        }
        Ok(Err(e)) => (StatusCode::UNPROCESSABLE_ENTITY, e).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

/// POST /image/svg?formato=png|jpeg|webp&calidad=88 — el SVG en el cuerpo.
pub async fn svg_handler(Query(q): Query<Salida>, cuerpo: Bytes) -> Response {
    let formato = q.formato.unwrap_or(Formato::Png);
    let calidad = q.calidad.unwrap_or(88);
    responder(move || {
        let img = svg_a_rgba(&cuerpo)?;
        Ok((codificar(&img, formato, calidad)?, formato))
    })
    .await
}

/// POST /image/convert?formato=&calidad=&ancho=&alto=&ajuste=inside|cover —
/// la imagen (PNG, JPEG o WebP estático) en el cuerpo.
pub async fn convert_handler(Query(q): Query<Salida>, cuerpo: Bytes) -> Response {
    let formato = q.formato.unwrap_or(Formato::Png);
    let calidad = q.calidad.unwrap_or(88);
    responder(move || {
        let mut img = crate::sticker::decodificar(&cuerpo)?;
        if let (Some(w), Some(h)) = (q.ancho, q.alto) {
            img = ajustar(img, w, h, q.ajuste.unwrap_or(Ajuste::Inside));
        }
        Ok((codificar(&img, formato, calidad)?, formato))
    })
    .await
}

pub fn ruta_svg<S: Clone + Send + Sync + 'static>() -> MethodRouter<S> {
    post(svg_handler).layer(DefaultBodyLimit::max(crate::sticker::MAX_ENTRADA))
}

pub fn ruta_convert<S: Clone + Send + Sync + 'static>() -> MethodRouter<S> {
    post(convert_handler).layer(DefaultBodyLimit::max(crate::sticker::MAX_ENTRADA))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dibuja_formas_y_colores() {
        let svg = br##"<svg xmlns="http://www.w3.org/2000/svg" width="100" height="50">
            <rect width="100" height="50" fill="#123456"/>
            <circle cx="75" cy="25" r="20" fill="#ff0000"/></svg>"##;
        let img = svg_a_rgba(svg).unwrap();
        assert_eq!(img.dimensions(), (100, 50));
        assert_eq!(img.get_pixel(5, 5).0, [0x12, 0x34, 0x56, 255]);
        assert_eq!(img.get_pixel(75, 25).0, [255, 0, 0, 255]);
    }

    #[test]
    fn el_texto_se_dibuja_con_las_fuentes_del_sistema() {
        if cuantas_fuentes() == 0 {
            eprintln!("sin fuentes en este sistema: no se prueba el texto");
            return;
        }
        let svg = br##"<svg xmlns="http://www.w3.org/2000/svg" width="300" height="80">
            <text x="10" y="60" font-size="48" font-family="Arial, sans-serif" fill="#000">Hola 123</text></svg>"##;
        let img = svg_a_rgba(svg).unwrap();
        let tinta = img.pixels().filter(|p| p[3] > 128).count();
        assert!(tinta > 500, "el texto no se dibujó ({tinta} píxeles)");
    }

    #[test]
    fn el_respaldo_de_un_simbolo_es_sin_serifa() {
        // Con la elección de usvg, en Windows "♡ Pareja: Leo" salía entero con
        // serifa: la primera fuente con ♡ tenía también las letras. Ahora, si
        // hay una de RESPALDOS con el símbolo, es esa.
        let db = fuentes();
        for c in ['♡', '⚔'] {
            let Some(id) = elegir_respaldo(&db, c) else {
                continue;
            };
            let familia = db
                .face(id)
                .map(|f| f.families[0].0.clone())
                .unwrap_or_default();
            let hay_preferida = db.faces().any(|f| {
                f.families
                    .iter()
                    .any(|(n, _)| RESPALDOS.contains(&n.as_str()))
                    && tiene(&db, f.id, c)
            });
            assert!(
                !hay_preferida || RESPALDOS.contains(&familia.as_str()),
                "el respaldo de {c} es {familia}"
            );
            assert!(tiene(&db, id, c));
        }
    }

    #[test]
    fn una_imagen_solo_puede_ser_data() {
        // Un archivo del disco no se lee; un data: sí.
        let mut png = Vec::new();
        RgbaImage::from_pixel(4, 4, image::Rgba([0, 255, 0, 255]))
            .write_to(&mut std::io::Cursor::new(&mut png), image::ImageFormat::Png)
            .unwrap();
        use base64::Engine;
        let b64 = base64::engine::general_purpose::STANDARD.encode(&png);
        let svg = format!(
            r#"<svg xmlns="http://www.w3.org/2000/svg" width="20" height="10">
            <image x="0" y="0" width="10" height="10" href="Cargo.toml"/>
            <image x="10" y="0" width="10" height="10" href="data:image/png;base64,{b64}"/></svg>"#
        );
        let img = svg_a_rgba(svg.as_bytes()).unwrap();
        assert_eq!(img.get_pixel(5, 5)[3], 0, "leyó un archivo");
        assert_eq!(img.get_pixel(15, 5).0, [0, 255, 0, 255]);
    }

    #[test]
    fn rechaza_lo_que_no_es_svg_y_lo_enorme() {
        assert!(svg_a_rgba(b"hola").is_err());
        let enorme = br#"<svg xmlns="http://www.w3.org/2000/svg" width="20000" height="20000"/>"#;
        assert!(svg_a_rgba(enorme).is_err());
    }

    #[test]
    fn cover_recorta_al_centro_e_inside_no_agranda() {
        // Mitad izquierda roja, mitad derecha azul, 200x100.
        let img = RgbaImage::from_fn(200, 100, |x, _| {
            if x < 100 {
                image::Rgba([255, 0, 0, 255])
            } else {
                image::Rgba([0, 0, 255, 255])
            }
        });
        let c = ajustar(img.clone(), 50, 50, Ajuste::Cover);
        assert_eq!(c.dimensions(), (50, 50));
        assert!(c.get_pixel(2, 25)[0] > 200 && c.get_pixel(47, 25)[2] > 200);
        assert_eq!(
            ajustar(img.clone(), 100, 100, Ajuste::Inside).dimensions(),
            (100, 50)
        );
        assert_eq!(
            ajustar(img, 500, 500, Ajuste::Inside).dimensions(),
            (200, 100)
        );
    }

    #[test]
    fn codifica_los_tres_formatos() {
        let img = RgbaImage::from_pixel(32, 16, image::Rgba([10, 200, 30, 255]));
        let png = codificar(&img, Formato::Png, 0).unwrap();
        assert_eq!(image::load_from_memory(&png).unwrap().to_rgba8(), img);
        let jpg = codificar(&img, Formato::Jpeg, 90).unwrap();
        assert!(crate::sticker::es_jpeg(&jpg));
        let webp = codificar(&img, Formato::Webp, 90).unwrap();
        assert!(crate::sticker::es_webp(&webp));
    }
}
