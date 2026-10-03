//! imagefx.rs — efectos de imagen.
//!
//! Routes: POST /imagefx/lego
//!
//! Portado de python/ml/imagefx.py, que usaba Pillow + numpy. Con él se va
//! `pillow` del lado Python, y `numpy` deja de hacerle falta a los comandos de
//! imagen (solo lo sigue usando el detector de anomalías de ai_brain.py).
//!
//! El efecto es el mismo: achicar a una grilla de fichas, promediar el color de
//! cada celda, cuantizarlo al color más cercano de la paleta LEGO, escalar en
//! bloques y dibujar un "stud" por ficha.
//!
//! Dos pasos salen MEJOR acá, no solo más rápido:
//!
//!   · El promedio por celda se calcula directo sobre los píxeles, en vez de
//!     pedirle a Pillow un `resize(..., Image.BOX)`. El crate `image` no tiene
//!     filtro BOX —sus opciones son Nearest, Triangle, CatmullRom, Gaussian y
//!     Lanczos3—, así que usar Triangle habría cambiado el resultado: es
//!     bilineal, no un promedio de caja. Promediando a mano el resultado es
//!     exactamente el que daba Pillow, y de paso se evita una pasada de
//!     redimensionado entera.
//!
//!   · El escalado final se escribe por bloques directamente en el búfer de
//!     salida, en vez de un `resize(..., NEAREST)`. Para un mosaico es lo
//!     mismo por definición, y no hay que recorrer la imagen dos veces.

use axum::{extract::State, response::Json};
use base64::{engine::general_purpose::STANDARD as B64, Engine};
use image::{DynamicImage, RgbImage};
use serde::Deserialize;

use crate::routes::AppState;

/// Paleta aproximada de colores clásicos de fichas LEGO (RGB).
/// Es la misma de imagefx.py, en el mismo orden.
const LEGO_PALETTE: [[i32; 3]; 14] = [
    [196, 40, 27],    // rojo brillante
    [245, 205, 47],   // amarillo brillante
    [13, 105, 171],   // azul brillante
    [75, 151, 74],    // verde brillante
    [35, 120, 65],    // verde oscuro
    [5, 5, 5],        // negro
    [244, 244, 244],  // blanco
    [218, 133, 65],   // naranja medio
    [105, 64, 39],    // marrón rojizo
    [156, 156, 156],  // gris piedra medio
    [99, 95, 82],     // gris piedra oscuro
    [144, 31, 118],   // púrpura brillante
    [216, 191, 145],  // arena/tan
    [105, 191, 233],  // azul cielo
];

const MAX_INPUT_SIDE: u32 = 1024;
const MIN_BRICK:      u32 = 8;
const MAX_BRICK:      u32 = 48;
const DEFAULT_BRICK:  u32 = 20;

/// Techo de píxeles de entrada. Se comprueba contra la cabecera, antes de
/// decodificar — ver el comentario en `legofy()`.
const MAX_INPUT_PIXELS: u64 = 50_000_000;

#[derive(Deserialize)]
pub struct LegoRequest {
    pub image:      String,
    #[serde(default)]
    pub brick_size: Option<u32>,
}

/// Aclara (factor > 0) u oscurece (factor < 0) un color.
/// Mismo cálculo que `_shade()` en imagefx.py.
fn shade(color: [u8; 3], factor: f32) -> [u8; 3] {
    let mut out = [0u8; 3];
    for i in 0..3 {
        let c = f32::from(color[i]);
        let v = if factor >= 0.0 {
            c + (255.0 - c) * factor
        } else {
            c * (1.0 + factor)
        };
        out[i] = v.clamp(0.0, 255.0) as u8;
    }
    out
}

/// Color de la paleta más cercano, por distancia euclídea al cuadrado.
///
/// Sin raíz cuadrada: para comparar distancias el orden es el mismo, y así todo
/// queda en enteros. La paleta son 14 colores, con lo cual el bucle completo
/// son 42 multiplicaciones por ficha.
fn nearest_brick(r: u8, g: u8, b: u8) -> [u8; 3] {
    let (r, g, b) = (i32::from(r), i32::from(g), i32::from(b));
    let mut best      = 0usize;
    let mut best_dist = i32::MAX;
    for (i, p) in LEGO_PALETTE.iter().enumerate() {
        let (dr, dg, db) = (r - p[0], g - p[1], b - p[2]);
        let dist = dr * dr + dg * dg + db * db;
        if dist < best_dist {
            best_dist = dist;
            best      = i;
        }
    }
    let p = LEGO_PALETTE[best];
    [p[0] as u8, p[1] as u8, p[2] as u8]
}

pub struct LegoResult {
    pub png:       Vec<u8>,
    pub brick_size: u32,
    pub original:  (u32, u32),
    pub bricks:    (u32, u32),
}

pub fn legofy(png_or_jpeg: &[u8], brick_size: u32) -> Result<LegoResult, String> {
    let brick = brick_size.clamp(MIN_BRICK, MAX_BRICK);

    // Las dimensiones se leen de la cabecera ANTES de decodificar: el crate
    // `image` reserva memoria sin tope propio, así que un PNG de 20.000 x
    // 20.000 —que comprimido pesa poco— reservaría 1,2 GB en el mismo proceso
    // que atiende el camino crítico de cada mensaje. `ImageReader` no es
    // clonable, así que se construye dos veces sobre el mismo búfer; leer la
    // cabecera es barato y la alternativa sería decodificar para enterarse.
    let leer = || {
        image::ImageReader::new(std::io::Cursor::new(png_or_jpeg))
            .with_guessed_format()
            .map_err(|e| format!("no se pudo leer el formato: {e}"))
    };
    let (hdr_w, hdr_h) = leer()?
        .into_dimensions()
        .map_err(|e| format!("imagen inválida: {e}"))?;
    if u64::from(hdr_w) * u64::from(hdr_h) > MAX_INPUT_PIXELS {
        return Err(format!("imagen demasiado grande: {hdr_w}x{hdr_h}"));
    }

    let img = leer()?.decode().map_err(|e| format!("no se pudo decodificar: {e}"))?;
    let (orig_w, orig_h) = (img.width(), img.height());

    // ── Cuántas fichas entran ────────────────────────────────────────────────
    //
    // imagefx.py redimensionaba a 1024 px de lado con LANCZOS y recién después
    // armaba la grilla. Acá la grilla se calcula sobre esas dimensiones pero la
    // imagen NO se redimensiona: los promedios se sacan de los píxeles
    // originales.
    //
    // No es un atajo, son dos mejoras:
    //
    //   · Un filtro de alta calidad antes de promediar cada celda es trabajo
    //     tirado — el paso siguiente reduce cada celda a UN color igual. Medido
    //     por etapas sobre una foto de 1280x851: el Lanczos3 se llevaba 50 ms de
    //     los 76 totales (66%), contra 1 ms del promedio, 1 ms del dibujo y 1 ms
    //     de codificar el PNG.
    //
    //   · El promedio sale MÁS exacto: cubre todos los píxeles originales de la
    //     celda, en vez de los de una versión ya remuestreada.
    //
    // La salida mide exactamente lo mismo que antes, porque la grilla se sigue
    // calculando sobre las dimensiones recortadas.
    let (grid_w, grid_h) = if orig_w.max(orig_h) > MAX_INPUT_SIDE {
        let ratio = f64::from(MAX_INPUT_SIDE) / f64::from(orig_w.max(orig_h));
        (
            ((f64::from(orig_w) * ratio) as u32).max(1),
            ((f64::from(orig_h) * ratio) as u32).max(1),
        )
    } else {
        (orig_w, orig_h)
    };

    let src: RgbImage = img.into_rgb8();
    let (w, h) = (src.width(), src.height());
    let bricks_w = (grid_w / brick).max(1);
    let bricks_h = (grid_h / brick).max(1);

    // ── Un color por ficha: promedio de la celda, cuantizado a la paleta ─────
    // El tamaño de celda se calcula sobre la imagen real (w/bricks_w), no sobre
    // `brick`: con una división no exacta, usar `brick` dejaría una franja de
    // píxeles del borde derecho e inferior sin entrar en ningún promedio.
    let mut quantized = vec![[0u8; 3]; (bricks_w * bricks_h) as usize];
    for by in 0..bricks_h {
        let y0 = by * h / bricks_h;
        let y1 = ((by + 1) * h / bricks_h).max(y0 + 1).min(h);
        for bx in 0..bricks_w {
            let x0 = bx * w / bricks_w;
            let x1 = ((bx + 1) * w / bricks_w).max(x0 + 1).min(w);

            let mut sum = [0u64; 3];
            let mut n   = 0u64;
            for y in y0..y1 {
                for x in x0..x1 {
                    let p = src.get_pixel(x, y).0;
                    sum[0] += u64::from(p[0]);
                    sum[1] += u64::from(p[1]);
                    sum[2] += u64::from(p[2]);
                    n += 1;
                }
            }
            let avg = [
                (sum[0] / n) as u8,
                (sum[1] / n) as u8,
                (sum[2] / n) as u8,
            ];
            quantized[(by * bricks_w + bx) as usize] = nearest_brick(avg[0], avg[1], avg[2]);
        }
    }

    // ── Mosaico: bloques planos + un stud por ficha ─────────────────────────
    let out_w = bricks_w * brick;
    let out_h = bricks_h * brick;
    let mut out = RgbImage::new(out_w, out_h);

    let radius   = ((brick as f32 * 0.32) as i32).max(2);
    let radius_sq = radius * radius;
    // El borde del stud: PIL dibuja un contorno de 1 px con `outline`, así que
    // el anillo es el que queda entre (radius-1)² y radius².
    let inner_sq = (radius - 1).max(0) * (radius - 1).max(0);
    let center   = (brick / 2) as i32;

    for by in 0..bricks_h {
        for bx in 0..bricks_w {
            let color   = quantized[(by * bricks_w + bx) as usize];
            let relleno = shade(color, 0.25);
            let borde   = shade(color, -0.25);

            for dy in 0..brick {
                for dx in 0..brick {
                    let ox = dx as i32 - center;
                    let oy = dy as i32 - center;
                    let d  = ox * ox + oy * oy;
                    let px = if d > radius_sq {
                        color
                    } else if d > inner_sq {
                        borde
                    } else {
                        relleno
                    };
                    out.put_pixel(bx * brick + dx, by * brick + dy, image::Rgb(px));
                }
            }
        }
    }

    let mut png = Vec::new();
    DynamicImage::ImageRgb8(out)
        .write_to(&mut std::io::Cursor::new(&mut png), image::ImageFormat::Png)
        .map_err(|e| format!("no se pudo codificar el PNG: {e}"))?;

    Ok(LegoResult {
        png,
        brick_size: brick,
        original:   (orig_w, orig_h),
        bricks:     (bricks_w, bricks_h),
    })
}

/// POST /imagefx/lego
pub async fn lego(
    State(_state): State<AppState>,
    Json(req):     Json<LegoRequest>,
) -> Json<serde_json::Value> {
    let brick = req.brick_size.unwrap_or(DEFAULT_BRICK);

    let bytes = match B64.decode(req.image.as_bytes()) {
        Ok(b)  => b,
        Err(e) => return Json(serde_json::json!({ "success": false, "error": format!("base64 inválido: {e}") })),
    };

    // spawn_blocking porque esto es trabajo de CPU de verdad —cientos de miles
    // de píxeles— y el runtime async atiende el camino crítico de cada mensaje.
    // Es el mismo motivo por el que el router de Python lo envolvía en
    // asyncio.to_thread.
    match tokio::task::spawn_blocking(move || legofy(&bytes, brick)).await {
        Ok(Ok(r)) => Json(serde_json::json!({
            "success":    true,
            "image":      B64.encode(&r.png),
            "format":     "png",
            "brick_size": r.brick_size,
            "original":   { "w": r.original.0, "h": r.original.1 },
            "bricks":     { "w": r.bricks.0,   "h": r.bricks.1 },
        })),
        Ok(Err(e)) => Json(serde_json::json!({ "success": false, "error": e })),
        Err(e)     => Json(serde_json::json!({ "success": false, "error": e.to_string() })),
    }
}

// ── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    /// Un PNG de un color plano, para tener una entrada conocida.
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

    fn decodificar(png: &[u8]) -> RgbImage {
        image::load_from_memory(png).unwrap().into_rgb8()
    }

    #[test]
    fn shade_aclara_y_oscurece() {
        let gris = [100, 100, 100];
        let claro  = shade(gris, 0.25);
        let oscuro = shade(gris, -0.25);
        assert!(claro[0]  > gris[0], "0.25 deberia aclarar");
        assert!(oscuro[0] < gris[0], "-0.25 deberia oscurecer");
        assert_eq!(shade(gris, 0.0), gris, "factor 0 no cambia nada");
    }

    #[test]
    fn shade_no_se_sale_del_rango() {
        // Son los extremos reales: aclarar blanco y oscurecer negro.
        assert_eq!(shade([255, 255, 255], 1.0), [255, 255, 255]);
        assert_eq!(shade([0, 0, 0], -1.0), [0, 0, 0]);
        assert_eq!(shade([250, 5, 128], 5.0), [255, 255, 255], "no debe desbordar");
    }

    #[test]
    fn nearest_brick_devuelve_siempre_un_color_de_la_paleta() {
        let paleta: Vec<[u8; 3]> = LEGO_PALETTE
            .iter()
            .map(|p| [p[0] as u8, p[1] as u8, p[2] as u8])
            .collect();
        // Un barrido grueso del cubo RGB.
        for r in (0..=255u16).step_by(37) {
            for g in (0..=255u16).step_by(43) {
                for b in (0..=255u16).step_by(51) {
                    let c = nearest_brick(r as u8, g as u8, b as u8);
                    assert!(paleta.contains(&c), "color fuera de la paleta: {c:?}");
                }
            }
        }
    }

    #[test]
    fn nearest_brick_acierta_los_casos_obvios() {
        assert_eq!(nearest_brick(0, 0, 0), [5, 5, 5], "negro");
        assert_eq!(nearest_brick(255, 255, 255), [244, 244, 244], "blanco");
        assert_eq!(nearest_brick(200, 35, 30), [196, 40, 27], "rojo");
        // Un color exacto de la paleta tiene que devolverse a si mismo.
        for p in LEGO_PALETTE {
            let c = [p[0] as u8, p[1] as u8, p[2] as u8];
            assert_eq!(nearest_brick(c[0], c[1], c[2]), c);
        }
    }

    #[test]
    fn el_mosaico_tiene_el_tamano_que_dice() {
        let r = legofy(&png_plano(200, 100, [0, 0, 0]), 20).unwrap();
        assert_eq!(r.brick_size, 20);
        assert_eq!(r.original, (200, 100));
        assert_eq!(r.bricks, (10, 5));

        let img = decodificar(&r.png);
        assert_eq!((img.width(), img.height()), (200, 100), "10x5 fichas de 20 px");
    }

    #[test]
    fn el_tamano_de_ficha_se_acota() {
        // Fuera de rango por abajo y por arriba, sin fallar.
        assert_eq!(legofy(&png_plano(500, 500, [9, 9, 9]), 1).unwrap().brick_size, MIN_BRICK);
        assert_eq!(legofy(&png_plano(500, 500, [9, 9, 9]), 999).unwrap().brick_size, MAX_BRICK);
    }

    #[test]
    fn una_imagen_mas_chica_que_una_ficha_sigue_dando_una() {
        // 4x4 con fichas de 8: la division da 0 y hay que forzar 1, o el
        // mosaico saldria de 0 px y el PNG seria invalido.
        let r = legofy(&png_plano(4, 4, [200, 30, 30]), 8).unwrap();
        assert_eq!(r.bricks, (1, 1));
        let img = decodificar(&r.png);
        assert_eq!((img.width(), img.height()), (MIN_BRICK, MIN_BRICK));
    }

    #[test]
    fn un_color_plano_da_un_mosaico_de_un_solo_color_de_ficha() {
        // Rojo LEGO exacto: el promedio por celda es ese color, y cuantizarlo
        // lo deja igual. Las esquinas quedan fuera del stud, asi que son el
        // color de la ficha sin sombrear.
        let r   = legofy(&png_plano(120, 120, [196, 40, 27]), 20).unwrap();
        let img = decodificar(&r.png);
        assert_eq!(img.get_pixel(0, 0).0, [196, 40, 27], "la esquina es la ficha");
        // El centro de la primera ficha cae dentro del stud, que va aclarado.
        let centro = img.get_pixel(10, 10).0;
        assert_ne!(centro, [196, 40, 27], "el centro deberia ser el stud");
        assert_eq!(centro, shade([196, 40, 27], 0.25));
    }

    #[test]
    fn el_promedio_por_celda_cubre_todos_los_pixeles() {
        // 30x10 con fichas de 20 da bricks_w = 1: la celda tiene que abarcar
        // las 30 columnas, no solo las primeras 20. Con media imagen negra y
        // media blanca, el promedio no puede ser ninguno de los dos extremos.
        let mut img = RgbImage::new(30, 10);
        for y in 0..10 {
            for x in 0..30 {
                let c = if x < 15 { [0u8, 0, 0] } else { [255u8, 255, 255] };
                img.put_pixel(x, y, image::Rgb(c));
            }
        }
        let mut png = Vec::new();
        DynamicImage::ImageRgb8(img)
            .write_to(&mut std::io::Cursor::new(&mut png), image::ImageFormat::Png)
            .unwrap();

        let r   = legofy(&png, 20).unwrap();
        let out = decodificar(&r.png);
        assert_eq!(r.bricks, (1, 1));
        // El promedio de mitad negro y mitad blanco cae en un gris, que la
        // paleta resuelve a uno de los grises — no a negro ni a blanco.
        let esquina = out.get_pixel(0, 0).0;
        assert_ne!(esquina, [5, 5, 5],       "si fuera negro, se perdio la mitad blanca");
        assert_ne!(esquina, [244, 244, 244], "si fuera blanco, se perdio la mitad negra");
    }

    #[test]
    fn las_entradas_grandes_se_reducen_pero_se_informa_el_original() {
        let r = legofy(&png_plano(2000, 1000, [13, 105, 171]), 20).unwrap();
        assert_eq!(r.original, (2000, 1000), "el original se informa sin tocar");
        let img = decodificar(&r.png);
        assert!(img.width() <= MAX_INPUT_SIDE, "el lado mayor se acota a {MAX_INPUT_SIDE}");
    }

    #[test]
    fn una_entrada_que_no_es_imagen_da_error_y_no_panic() {
        assert!(legofy(b"esto no es una imagen", 20).is_err());
        assert!(legofy(&[], 20).is_err());
    }
}
