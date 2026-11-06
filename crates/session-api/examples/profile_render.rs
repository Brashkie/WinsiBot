//! Cuánto tarda un SVG en pasar a imagen (ver render.rs).
//!
//!   cargo run --release -p winsibot-session-api --features native --example profile_render -- a.svg [b.svg ...]
//!
//! Por cada SVG: la mediana de 12, en PNG y en JPEG, y deja `<nombre>.resvg.png`
//! y `.jpeg` al lado, para mirarlos.

use std::time::Instant;
use winsibot_session_api::render::{codificar, svg_a_rgba, Formato};

fn main() {
    let t = Instant::now();
    let n = winsibot_session_api::render::cuantas_fuentes();
    println!(
        "fuentes: {n}, cargadas en {:.0} ms (una vez, la primera)",
        t.elapsed().as_secs_f64() * 1e3
    );
    for ruta in std::env::args().skip(1) {
        let svg = std::fs::read(&ruta).expect("no pude leer el SVG");
        for (formato, ext) in [(Formato::Png, "png"), (Formato::Jpeg, "jpeg")] {
            let mut tiempos = Vec::new();
            let mut salida = Vec::new();
            for _ in 0..12 {
                let t = Instant::now();
                let img = svg_a_rgba(&svg).unwrap();
                salida = codificar(&img, formato, 88).unwrap();
                tiempos.push(t.elapsed().as_secs_f64() * 1e3);
            }
            tiempos.sort_by(f64::total_cmp);
            let destino = ruta.trim_end_matches(".svg").to_string() + ".resvg." + ext;
            std::fs::write(&destino, &salida).unwrap();
            println!(
                "{ruta} → {ext}: {:.1} ms · {} bytes",
                tiempos[6],
                salida.len()
            );
        }
    }
}
