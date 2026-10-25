//! `#upscale` etapa por etapa, sobre el tamaño real: la imagen YA ampliada.
//!
//!   cargo run --release --features native --example profile_stages -- media/WinsiBot.png [escala]
//!
//! profile_upscale.rs mide el total y le resta lo que puede reproducir desde
//! afuera; este mide cada etapa por separado, con mediana de varias vueltas,
//! para decidir qué optimizar a continuación con un número y no a ojo. Mide
//! también cuánto cuesta solo PEDIR una imagen nueva del mismo tamaño (cada
//! kernel devuelve una), para saber cuánto de cada etapa es memoria y no
//! cálculo.

use std::time::Instant;

use image::RgbaImage;
use winsibot_session_api::anime4k::{self, A4K_FUERZA_COLOR, A4K_FUERZA_GRADIENTE, A4K_PASADAS};
use winsibot_session_api::{jpeg, resize};

fn mediana<T>(vueltas: u32, mut f: impl FnMut() -> T) -> (f64, T) {
    let mut t = Vec::new();
    let mut ultimo = None;
    for _ in 0..vueltas {
        let t0 = Instant::now();
        ultimo = Some(std::hint::black_box(f()));
        t.push(t0.elapsed().as_secs_f64() * 1000.0);
    }
    t.sort_by(|a, b| a.partial_cmp(b).unwrap());
    (t[t.len() / 2], ultimo.unwrap())
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let ruta = args.get(1).map(String::as_str).unwrap_or("media/WinsiBot.png");
    let escala: u32 = args.get(2).and_then(|s| s.parse().ok()).unwrap_or(2);
    let bytes = std::fs::read(ruta).expect("no pude leer la imagen");
    let v = 7;
    println!("hilos: {} · backends {:?}", anime4k::hilos(), anime4k::elegido());

    let (t_dec, img) = mediana(v, || image::load_from_memory(&bytes).unwrap());
    let (w, h) = (img.width() * escala, img.height() * escala);
    println!("{}x{} → {}x{} ({:.1} Mpx), {} pasadas\n", img.width(), img.height(), w, h, (w * h) as f64 / 1e6, A4K_PASADAS);
    let rgba = img.to_rgba8();
    let (t_rgba, _) = mediana(v, || img.to_rgba8());
    let (t_res, base) = mediana(v, || resize::catmullrom_rgba(&rgba, w, h));
    let (t_nueva, _) = mediana(v, || RgbaImage::new(w, h));
    let (t_clon, _) = mediana(v, || base.clone());

    let mut buf = base.clone();
    let (mut t_lum, mut t_col, mut t_gra, mut t_pg, mut t_fus) = (0.0, 0.0, 0.0, 0.0, 0.0);
    for _ in 0..A4K_PASADAS {
        let entrada = buf.clone();
        let (t, b) = mediana(v, || {
            let mut b = entrada.clone();
            anime4k::luminancia_en_alfa(&mut b);
            b
        });
        t_lum += t - t_clon; // le resto el clon que hace la medición
        let (t, b) = mediana(v, || anime4k::push_color(&b, A4K_FUERZA_COLOR));
        t_col += t;
        let (t, g) = mediana(v, || anime4k::gradiente(&b));
        t_gra += t;
        let (t, p) = mediana(v, || anime4k::push_gradient(&g, A4K_FUERZA_GRADIENTE));
        t_pg += t;
        // Lo que usa #upscale: los dos fusionados si están en Zig.
        let (t, pf) = mediana(v, || anime4k::gradiente_y_push(&b, A4K_FUERZA_GRADIENTE));
        t_fus += t;
        assert_eq!(pf, p, "la fusión tiene que dar lo mismo");
        buf = p;
    }
    let (t_alfa, rgb) = mediana(v, || anime4k::sin_alfa(&buf));
    let (t_jpg, salida) = mediana(v, || jpeg::codificar(&rgb, jpeg::CALIDAD));

    let etapas = [
        ("decodificar PNG", t_dec),
        ("a RGBA", t_rgba),
        ("redimensionar (Zig)", t_res),
        ("luminancia al alfa", t_lum.max(0.0)),
        ("push_color", t_col),
        ("Sobel + push_gradient", t_fus),
        ("quitar alfa", t_alfa),
        ("codificar JPEG", t_jpg),
    ];
    let total: f64 = etapas.iter().map(|e| e.1).sum();
    for (n, t) in etapas {
        println!("{n:<22}{t:>8.1} ms  {:>5.1}%", t / total * 100.0);
    }
    println!("{:<22}{total:>8.1} ms\n", "TOTAL");
    println!("Sobel + push_gradient por separado: {:.1} + {:.1} = {:.1} ms; como los usa #upscale: {t_fus:.1} ms", t_gra, t_pg, t_gra + t_pg);
    println!("pedir una imagen nueva de este tamaño: {t_nueva:.2} ms · clonarla: {t_clon:.2} ms");
    println!("cada pasada pide 3 imágenes nuevas: {:.1} ms en {} pasadas", 3.0 * t_nueva * A4K_PASADAS as f64, A4K_PASADAS);
    println!("JPEG de salida: {:.0} KB", salida.len() as f64 / 1024.0);

    // De punta a punta: el camino de antes de la 8.17.0 (luminancia aparte en
    // cada pasada y copia a RGB antes del JPEG) contra el de #upscale ahora
    // (la luminancia de la 2.ª pasada sale del kernel fusionado y el JPEG lee
    // RGBA). Tienen que dar el mismo archivo.
    let (t_antes, jpg_antes) = mediana(v, || {
        let mut b = resize::catmullrom_rgba(&image::load_from_memory(&bytes).unwrap().to_rgba8(), w, h);
        for _ in 0..A4K_PASADAS {
            anime4k::luminancia_en_alfa(&mut b);
            b = anime4k::push_color(&b, A4K_FUERZA_COLOR);
            b = anime4k::gradiente_y_push(&b, A4K_FUERZA_GRADIENTE);
        }
        jpeg::codificar(&anime4k::sin_alfa(&b), jpeg::CALIDAD)
    });
    let (t_ahora, jpg_ahora) = mediana(v, || {
        let (b, _, _) = winsibot_session_api::vision::upscale_rgba(&bytes, escala).unwrap();
        jpeg::codificar_rgba(&b, jpeg::CALIDAD)
    });
    assert_eq!(jpg_antes, jpg_ahora, "el camino fusionado tiene que dar el mismo JPEG");
    println!("de punta a punta: antes {t_antes:.1} ms · ahora {t_ahora:.1} ms (el mismo JPEG, byte a byte)");
    // Para revisarlo con otro decodificador (ffmpeg, un visor, WhatsApp).
    if let Ok(ruta) = std::env::var("GUARDAR") {
        std::fs::write(&ruta, &salida).expect("no pude guardar el JPEG");
        println!("guardado en {ruta}");
    }
}
