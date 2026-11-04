//! Cuánto tarda un sticker, por etapas (ver sticker.rs).
//!
//!   cargo run --release -p winsibot-session-api --features native --example profile_sticker [imagen]
//!
//! Sin imagen usa media/WinsiBot.png, su versión JPEG y una foto de 4000x3000
//! armada a partir de ella (la reducción grande, de casi 8 veces).

use std::time::Instant;
use winsibot_session_api::sticker;

fn mediana(mut v: Vec<f64>) -> f64 {
    v.sort_by(f64::total_cmp);
    v[v.len() / 2]
}

fn medir(nombre: &str, b: &[u8]) {
    let (mut td, mut tr, mut te, mut tt) = (vec![], vec![], vec![], vec![]);
    let mut salida = 0;
    for _ in 0..12 {
        let t = Instant::now();
        let img = sticker::decodificar(b).unwrap();
        td.push(t.elapsed().as_secs_f64() * 1e3);
        let (w, h) = sticker::tamano(img.width(), img.height(), false);
        let t = Instant::now();
        let r = winsibot_session_api::resize::catmullrom_rgba(&img, w, h);
        tr.push(t.elapsed().as_secs_f64() * 1e3);
        let t = Instant::now();
        let webp = sticker::codificar_webp(&r, 50.0).unwrap();
        te.push(t.elapsed().as_secs_f64() * 1e3);
        let t = Instant::now();
        salida = sticker::sticker(b, 50.0, false).unwrap().len();
        tt.push(t.elapsed().as_secs_f64() * 1e3);
        assert!(!webp.is_empty());
    }
    let img = sticker::decodificar(b).unwrap();
    println!(
        "{nombre} {}x{}: decodificar {:.1} · redimensionar {:.1} · WebP {:.1} · sticker entero {:.1} ms · {} bytes",
        img.width(),
        img.height(),
        mediana(td),
        mediana(tr),
        mediana(te),
        mediana(tt),
        salida
    );
}

fn main() {
    println!(
        "plataforma: {}",
        winsibot_session_api::platform::detect().summary()
    );
    if let Some(ruta) = std::env::args().nth(1) {
        medir(
            &ruta,
            &std::fs::read(&ruta).expect("no pude leer la imagen"),
        );
        return;
    }
    let png = std::fs::read("media/WinsiBot.png").expect("media/WinsiBot.png");
    medir("PNG", &png);
    let img = image::load_from_memory(&png).unwrap().to_rgb8();
    let jpeg = winsibot_session_api::jpeg::codificar(&img, 90);
    medir("JPEG", &jpeg);
    let grande = image::imageops::resize(&img, 4000, 3000, image::imageops::FilterType::Triangle);
    let jpeg = winsibot_session_api::jpeg::codificar(&grande, 90);
    medir("JPEG", &jpeg);
}
