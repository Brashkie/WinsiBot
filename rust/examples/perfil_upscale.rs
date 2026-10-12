//! Dónde se van los milisegundos de `#upscale`, por etapa.
//!
//! Existe para contestar una pregunta concreta con un número en vez de una
//! intuición: si algún día se plantea reescribir los kernels de Anime4K en
//! otro lenguaje o a mano con SIMD, lo primero es saber **qué fracción del
//! tiempo está en los kernels** y no en el redimensionado o en codificar el
//! PNG. Si los kernels fueran el 20%, hacerlos infinitamente rápidos daría
//! como mucho un 1,25x — y no valdría la pena ni empezar.
//!
//! Las etapas internas (`push_color`, `gradiente`, `push_gradient`) son
//! privadas, así que no se miden una por una: se mide el total y se le restan
//! las partes que sí se pueden reproducir desde fuera con el mismo crate y los
//! mismos parámetros que usa `upscale()`.
//!
//!   cargo run --release --example perfil_upscale -- <imagen> [escala]

use std::time::Instant;

use image::imageops::FilterType;
use winsibot_session_api::vision;

/// Mediana de varias corridas: una sola medición en un portátil con turbo y
/// otros procesos no dice gran cosa.
fn medir<T>(vueltas: u32, mut f: impl FnMut() -> T) -> (f64, T) {
    let mut tiempos = Vec::with_capacity(vueltas as usize);
    let mut ultimo = None;
    for _ in 0..vueltas {
        let t0 = Instant::now();
        ultimo = Some(f());
        tiempos.push(t0.elapsed().as_secs_f64() * 1000.0);
    }
    tiempos.sort_by(|a, b| a.partial_cmp(b).unwrap());
    (tiempos[tiempos.len() / 2], ultimo.unwrap())
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let ruta = args.get(1).expect("uso: perfil_upscale <imagen> [escala]");
    let escala: u32 = args.get(2).map(|s| s.parse().unwrap()).unwrap_or(2);

    let bytes = std::fs::read(ruta).expect("no pude leer la imagen");

    const VUELTAS: u32 = 7;

    // 1. Decodificar.
    let (t_decode, img) = medir(VUELTAS, || {
        image::load_from_memory(&bytes).expect("no se pudo decodificar")
    });
    let (w0, h0) = (img.width(), img.height());
    let (w, h) = (w0 * escala, h0 * escala);

    // 2. El mismo redimensionado bicúbico que hace upscale().
    let rgba = img.to_rgba8();
    let (t_resize, ampliada) = medir(VUELTAS, || {
        image::imageops::resize(&rgba, w, h, FilterType::CatmullRom)
    });

    // 3. Codificar a PNG una imagen del tamaño de salida.
    let rgb = image::DynamicImage::ImageRgba8(ampliada).to_rgb8();
    let (t_png, _) = medir(VUELTAS, || {
        let mut png = Vec::new();
        image::DynamicImage::ImageRgb8(rgb.clone())
            .write_to(&mut std::io::Cursor::new(&mut png), image::ImageFormat::Png)
            .unwrap();
        png
    });

    // 4. El camino completo.
    let (t_total, salida) = medir(VUELTAS, || {
        vision::upscale(&bytes, escala).expect("upscale fallo")
    });

    // Lo que queda son los kernels de Anime4K: las dos pasadas de luminancia,
    // push_color, Sobel y push_gradient, más la copia final RGBA->RGB.
    let t_kernels = (t_total - t_decode - t_resize - t_png).max(0.0);
    let pct = |x: f64| x / t_total * 100.0;

    println!();
    println!("  {}  {}x{} -> {}x{}  (escala {escala}, mediana de {VUELTAS})", ruta, w0, h0, w, h);
    println!();
    println!("    {:<34}{:>9}{:>9}", "etapa", "ms", "%");
    println!("    {}", "-".repeat(52));
    println!("    {:<34}{:>9.1}{:>8.1}%", "decodificar", t_decode, pct(t_decode));
    println!("    {:<34}{:>9.1}{:>8.1}%", "resize bicubico (CatmullRom)", t_resize, pct(t_resize));
    println!("    {:<34}{:>9.1}{:>8.1}%", "kernels Anime4K (por resta)", t_kernels, pct(t_kernels));
    println!("    {:<34}{:>9.1}{:>8.1}%", "codificar PNG", t_png, pct(t_png));
    println!("    {}", "-".repeat(52));
    println!("    {:<34}{:>9.1}{:>8.1}%", "total", t_total, 100.0);
    println!();
    println!("    salida: {} KB", salida.0.len() / 1024);
    println!();
    println!("    Techo de Amdahl: si los kernels tardaran CERO, el comando");
    println!("    entero bajaria de {:.1} ms a {:.1} ms, o sea {:.2}x.",
             t_total, t_total - t_kernels, t_total / (t_total - t_kernels).max(0.001));
    println!();
}
