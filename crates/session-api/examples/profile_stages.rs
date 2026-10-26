//! `#upscale` etapa por etapa, sobre el tamaño real: la imagen YA ampliada.
//!
//!   cargo run --release --features native --example profile_stages -- media/WinsiBot.png [escala]
//!
//! Mide cada etapa del camino de verdad (`vision::upscale_rgba` +
//! `jpeg::codificar_rgba`), con mediana de varias vueltas, para decidir qué
//! optimizar a continuación con un número y no a ojo. Al final compara de punta
//! a punta contra el camino por etapas de la 8.17.0 —la luminancia aparte en
//! cada pasada, los kernels por separado y la copia a RGB antes del JPEG— y
//! verifica que salga el mismo archivo, byte a byte.
//!
//! `GUARDAR=salida.jpg` escribe el JPEG, para mirarlo con otro decodificador.

use std::time::Instant;

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
    println!(
        "hilos: {} · backends {:?} · Zig en {}",
        anime4k::hilos(),
        anime4k::elegido(),
        winsibot_session_api::simd::nombre()
    );

    let (t_dec, img) = mediana(v, || image::load_from_memory(&bytes).unwrap());
    let (w, h) = (img.width() * escala, img.height() * escala);
    println!(
        "{ruta}: {}x{} → {}x{} ({:.1} Mpx), {} pasadas\n",
        img.width(),
        img.height(),
        w,
        h,
        (w * h) as f64 / 1e6,
        A4K_PASADAS
    );
    // Lo que hacía la 8.17.0 antes de la primera pasada, en tres recorridos…
    let (t_rgba, rgba) = mediana(v, || img.to_rgba8());
    let (t_res, base) = mediana(v, || resize::catmullrom_rgba(&rgba, w, h));
    let (t_clon, _) = mediana(v, || base.clone());
    let (t_lum, _) = mediana(v, || {
        let mut b = base.clone();
        anime4k::luminancia_en_alfa(&mut b);
        b
    });
    let t_lum = (t_lum - t_clon).max(0.0); // sin el clon que hace la medición
    // …y lo que hace ahora, en uno.
    let (t_para, mut buf) = mediana(v, || resize::para_anime4k(&img, w, h));
    let mut t_pasadas = Vec::new();
    for i in 0..A4K_PASADAS {
        let (t, b) = mediana(v, || anime4k::pasada(&buf, A4K_FUERZA_COLOR, A4K_FUERZA_GRADIENTE, i + 1 < A4K_PASADAS));
        t_pasadas.push(t);
        buf = b;
    }
    let (t_jpg, salida) = mediana(v, || jpeg::codificar_rgba(&buf, jpeg::CALIDAD));

    let mut etapas = vec![
        ("decodificar".to_string(), t_dec),
        ("redimensionar + luminancia".to_string(), t_para),
    ];
    for (i, t) in t_pasadas.iter().enumerate() {
        etapas.push((format!("pasada {} (Zig fusionada)", i + 1), *t));
    }
    etapas.push(("codificar JPEG (RGBA)".to_string(), t_jpg));
    let total: f64 = etapas.iter().map(|e| e.1).sum();
    for (n, t) in &etapas {
        println!("{n:<26}{t:>8.1} ms  {:>5.1}%", t / total * 100.0);
    }
    println!("{:<26}{total:>8.1} ms\n", "TOTAL");
    println!(
        "antes de la 1.ª pasada, por etapas (como la 8.17.0): a RGBA {t_rgba:.1} + redimensionar {t_res:.1} + luminancia {t_lum:.1} = {:.1} ms; ahora {t_para:.1} ms",
        t_rgba + t_res + t_lum
    );
    println!("clonar una imagen de este tamaño: {t_clon:.2} ms · JPEG de salida: {:.0} KB", salida.len() as f64 / 1024.0);
    if let Ok(ruta) = std::env::var("GUARDAR") {
        std::fs::write(&ruta, &salida).expect("no pude guardar el JPEG");
        println!("guardado en {ruta}");
    }

    // De punta a punta: el camino por etapas de la 8.17.0 —con los kernels de
    // hoy, así que mide lo que ganan las fusiones y no la versión entera— contra
    // el de ahora. Tienen que dar el mismo archivo.
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
    assert_eq!(jpg_antes, jpg_ahora, "el camino de ahora tiene que dar el mismo JPEG");
    println!("de punta a punta: por etapas (como la 8.17.0, con los kernels de hoy) {t_antes:.1} ms · ahora {t_ahora:.1} ms (el mismo JPEG, byte a byte)");
}
