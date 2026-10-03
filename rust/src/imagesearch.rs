//! imagesearch.rs — búsqueda y descarga de imágenes.
//!
//! Routes: POST /search/image, POST /search/images
//!
//! Portado de python/ml/search.py. Con él se van `requests` y `ddgs` del lado
//! Python, y con pillow (ver imagefx.rs) también la recodificación a JPEG.
//!
//! ── Por qué solo Bing ───────────────────────────────────────────────────────
//!
//! search.py intentaba primero DuckDuckGo con la librería `ddgs` y caía a
//! raspar Bing. Acá queda solo Bing, y es una decisión medida, no una pérdida:
//!
//!   · El endpoint interno de DuckDuckGo (`/i.js`) necesita un token `vqd` que
//!     hay que sacar de la página, y aun pasándoselo responde con un error.
//!     Comprobado al portar esto: el token se obtiene bien y la llamada falla
//!     igual. Eso es exactamente lo que la librería `ddgs` persigue versión a
//!     versión — reimplementarlo acá significa heredar ese mantenimiento.
//!
//!   · En producción DuckDuckGo ya era la rama poco fiable: iba detrás de un
//!     `time.sleep(random.uniform(1, 2))` para no que no lo bloquearan y de un
//!     `except: pass` sin log, así que cuando fallaba nadie se enteraba y la
//!     búsqueda terminaba en Bing de todas formas.
//!
//!   · Se va ese sleep de 1-2 s, que se pagaba en CADA búsqueda.
//!
//! Si alguna vez hace falta una segunda fuente, el sitio para agregarla es
//! `buscar_urls()`: devuelve una lista y el resto del flujo no cambia.

use axum::{extract::State, response::Json};
use base64::{engine::general_purpose::STANDARD as B64, Engine};
use image::DynamicImage;
use regex::Regex;
use serde::Deserialize;
use std::sync::OnceLock;
use std::time::Duration;

use crate::routes::AppState;

const UA: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) \
                  AppleWebKit/537.36 (KHTML, like Gecko) \
                  Chrome/120.0.0.0 Safari/537.36";

const TIMEOUT:      Duration = Duration::from_secs(10);
const MAX_RESULTS:  usize    = 15;
/// Techo de bytes a descargar de una imagen. Sin esto, una URL que apunte a un
/// archivo enorme se traería entero a memoria de este proceso.
const MAX_IMG_BYTES: usize = 12 * 1024 * 1024;
/// Cuántas URLs probar antes de rendirse: las primeras suelen estar caídas o
/// bloquear por referer. Es el mismo número que usaba search.py.
const MAX_INTENTOS: usize = 5;
const JPEG_QUALITY: u8    = 85;

/// Las URLs vienen en el HTML como `murl&quot;:&quot;https://...&quot;`.
/// Es la misma expresión que usaba search.py, verificada contra Bing al portar
/// esto: 35 resultados para una búsqueda cualquiera.
fn murl_re() -> &'static Regex {
    static R: OnceLock<Regex> = OnceLock::new();
    R.get_or_init(|| Regex::new(r"murl&quot;:&quot;(https?://[^&]+)&quot;").unwrap())
}

#[derive(Deserialize)]
pub struct SearchRequest {
    pub query:       String,
    #[serde(default)]
    pub max_results: Option<usize>,
}

/// Extrae las URLs de imagen de una página de resultados de Bing.
///
/// Separada de la petición HTTP para poder probarla con HTML fijo, sin red.
pub fn extraer_urls(html: &str, max: usize) -> Vec<String> {
    let mut vistas = std::collections::HashSet::new();
    let mut urls   = Vec::new();
    for c in murl_re().captures_iter(html) {
        let u = c[1].to_string();
        // Deduplicar conservando el orden: Bing repite la misma imagen en
        // varios bloques de la página.
        if vistas.insert(u.clone()) {
            urls.push(u);
            if urls.len() >= max {
                break;
            }
        }
    }
    urls
}

fn cliente() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(TIMEOUT)
        .user_agent(UA)
        .build()
        .map_err(|e| e.to_string())
}

pub async fn buscar_urls(query: &str, max: usize) -> Result<Vec<String>, String> {
    let url = format!(
        "https://www.bing.com/images/search?q={}&form=HDRSC2&first=1",
        urlencoding(query),
    );

    let res = cliente()?
        .get(&url)
        .header("Referer", "https://www.bing.com/")
        .header("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
        .send()
        .await
        .map_err(|e| format!("Bing no respondió: {e}"))?;

    if !res.status().is_success() {
        return Err(format!("Bing devolvió {}", res.status()));
    }

    let html = res.text().await.map_err(|e| e.to_string())?;
    let urls = extraer_urls(&html, max);
    if urls.is_empty() {
        // Si esto empieza a pasar siempre, Bing cambió el HTML y hay que
        // revisar murl_re() — no es un problema de la consulta.
        return Err("No se encontraron imagenes".into());
    }
    Ok(urls)
}

/// Codifica para query string. Es lo mínimo que hace falta —`requests.utils.quote`
/// del lado Python— y no justifica una dependencia nueva.
fn urlencoding(s: &str) -> String {
    let mut out = String::with_capacity(s.len() * 3);
    for b in s.as_bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(*b as char)
            }
            b' ' => out.push('+'),
            _ => out.push_str(&format!("%{b:02X}")),
        }
    }
    out
}

pub struct ImagenDescargada {
    pub jpeg:   Vec<u8>,
    pub width:  u32,
    pub height: u32,
}

pub async fn descargar(url: &str) -> Result<ImagenDescargada, String> {
    let res = cliente()?
        .get(url)
        .header("Referer", "https://www.bing.com/")
        .header("Accept", "image/webp,image/apng,image/*,*/*;q=0.8")
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        return Err(format!("HTTP {}", res.status()));
    }

    // Se comprueba el content-type antes de traer el cuerpo: una URL que
    // devuelve HTML (una página de error, un muro de login) no vale la pena
    // descargar y menos intentar decodificar.
    let ctype = res
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_string();
    if !ctype.contains("image") {
        return Err(format!("No es imagen: {ctype}"));
    }

    let bytes = res.bytes().await.map_err(|e| e.to_string())?;
    if bytes.len() > MAX_IMG_BYTES {
        return Err(format!("imagen demasiado pesada: {} bytes", bytes.len()));
    }

    // Decodificar y recodificar a JPEG es trabajo de CPU: fuera del runtime.
    tokio::task::spawn_blocking(move || -> Result<ImagenDescargada, String> {
        let img = image::ImageReader::new(std::io::Cursor::new(&bytes))
            .with_guessed_format()
            .map_err(|e| e.to_string())?
            .decode()
            .map_err(|e| format!("no se pudo decodificar: {e}"))?;
        let rgb = img.into_rgb8();
        let (width, height) = (rgb.width(), rgb.height());

        let mut jpeg = Vec::new();
        let mut enc = image::codecs::jpeg::JpegEncoder::new_with_quality(
            std::io::Cursor::new(&mut jpeg),
            JPEG_QUALITY,
        );
        enc.encode_image(&DynamicImage::ImageRgb8(rgb))
            .map_err(|e| format!("no se pudo codificar el JPEG: {e}"))?;

        Ok(ImagenDescargada { jpeg, width, height })
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Mezcla la lista en sitio.
///
/// Usa los bytes de un UUID v4 como entropía en vez de sumar el crate `rand`:
/// `uuid` ya está en el árbol, y para elegir una imagen entre quince no hace
/// falta un generador con garantías estadísticas. Fisher-Yates, de atrás para
/// adelante.
fn mezclar<T>(v: &mut [T]) {
    if v.len() < 2 {
        return;
    }
    let mut entropia: Vec<u8> = Vec::with_capacity(v.len() + 16);
    while entropia.len() < v.len() {
        entropia.extend_from_slice(uuid::Uuid::new_v4().as_bytes());
    }
    for i in (1..v.len()).rev() {
        let j = (entropia[i] as usize) % (i + 1);
        v.swap(i, j);
    }
}

/// POST /search/images — solo las URLs.
pub async fn search_images(
    State(_state): State<AppState>,
    Json(req):     Json<SearchRequest>,
) -> Json<serde_json::Value> {
    let max = req.max_results.unwrap_or(10).clamp(1, MAX_RESULTS);
    match buscar_urls(&req.query, max).await {
        Ok(urls) => Json(serde_json::json!({
            "success": true, "urls": urls, "total": urls.len(), "query": req.query,
        })),
        Err(e) => Json(serde_json::json!({ "success": false, "error": e })),
    }
}

/// POST /search/image — busca y devuelve una imagen ya descargada.
pub async fn search_image(
    State(_state): State<AppState>,
    Json(req):     Json<SearchRequest>,
) -> Json<serde_json::Value> {
    let mut urls = match buscar_urls(&req.query, MAX_RESULTS).await {
        Ok(u)  => u,
        Err(e) => return Json(serde_json::json!({ "success": false, "error": e })),
    };
    let total = urls.len();
    mezclar(&mut urls);

    let mut ultimo = String::from("desconocido");
    for url in urls.iter().take(MAX_INTENTOS) {
        match descargar(url).await {
            Ok(img) => {
                return Json(serde_json::json!({
                    "success": true,
                    "image":   B64.encode(&img.jpeg),
                    "format":  "jpeg",
                    "width":   img.width,
                    "height":  img.height,
                    "query":   req.query,
                    "total":   total,
                }))
            }
            Err(e) => ultimo = e,
        }
    }

    Json(serde_json::json!({
        "success": false,
        "error":   format!("No se pudo descargar. Ultimo error: {ultimo}"),
    }))
}

// ── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extrae_las_urls_del_html_de_bing() {
        let html = r#"<a m="{&quot;murl&quot;:&quot;https://a.com/1.jpg&quot;}">x</a>
                      <a m="{&quot;murl&quot;:&quot;https://b.com/2.png&quot;}">y</a>"#;
        assert_eq!(
            extraer_urls(html, 10),
            vec!["https://a.com/1.jpg", "https://b.com/2.png"],
        );
    }

    #[test]
    fn deduplica_conservando_el_orden() {
        // Bing repite la misma imagen en varios bloques de la pagina.
        let html = "murl&quot;:&quot;https://a.com/1.jpg&quot;                     murl&quot;:&quot;https://b.com/2.jpg&quot;                     murl&quot;:&quot;https://a.com/1.jpg&quot;";
        assert_eq!(
            extraer_urls(html, 10),
            vec!["https://a.com/1.jpg", "https://b.com/2.jpg"],
        );
    }

    #[test]
    fn respeta_el_maximo() {
        let html = (1..=20)
            .map(|i| format!("murl&quot;:&quot;https://x.com/{i}.jpg&quot;"))
            .collect::<Vec<_>>()
            .join(" ");
        assert_eq!(extraer_urls(&html, 5).len(), 5);
    }

    #[test]
    fn un_html_sin_resultados_da_una_lista_vacia() {
        assert!(extraer_urls("<html>no hay nada</html>", 10).is_empty());
        assert!(extraer_urls("", 10).is_empty());
    }

    #[test]
    fn no_confunde_http_con_otros_esquemas() {
        let html = "murl&quot;:&quot;data:image/png;base64,AAAA&quot;                     murl&quot;:&quot;https://ok.com/1.jpg&quot;";
        assert_eq!(extraer_urls(html, 10), vec!["https://ok.com/1.jpg"]);
    }

    #[test]
    fn urlencoding_escapa_lo_que_rompe_una_query() {
        assert_eq!(urlencoding("gato"), "gato");
        assert_eq!(urlencoding("gato negro"), "gato+negro");
        assert_eq!(urlencoding("a&b=c"), "a%26b%3Dc");
        assert_eq!(urlencoding("100%"), "100%25");
        // No escapa los caracteres que no hace falta escapar.
        assert_eq!(urlencoding("a-b_c.d~e"), "a-b_c.d~e");
    }

    #[test]
    fn urlencoding_maneja_acentos() {
        // UTF-8 de dos bytes, escapado byte a byte.
        assert_eq!(urlencoding("ñ"), "%C3%B1");
    }

    #[test]
    fn mezclar_conserva_todos_los_elementos() {
        let original: Vec<u32> = (0..15).collect();
        for _ in 0..50 {
            let mut v = original.clone();
            mezclar(&mut v);
            v.sort_unstable();
            assert_eq!(v, original, "no debe perder ni duplicar nada");
        }
    }

    #[test]
    fn mezclar_no_falla_con_cero_ni_un_elemento() {
        let mut vacio: Vec<u32> = vec![];
        mezclar(&mut vacio);
        assert!(vacio.is_empty());

        let mut uno = vec![42];
        mezclar(&mut uno);
        assert_eq!(uno, vec![42]);
    }

    #[test]
    fn mezclar_de_verdad_cambia_el_orden() {
        // Con 15 elementos, que 20 mezclas dieran todas el orden original
        // seria indistinguible de no mezclar nada.
        let original: Vec<u32> = (0..15).collect();
        let mut alguna_distinta = false;
        for _ in 0..20 {
            let mut v = original.clone();
            mezclar(&mut v);
            if v != original {
                alguna_distinta = true;
                break;
            }
        }
        assert!(alguna_distinta, "mezclar() no estaria mezclando");
    }
}
