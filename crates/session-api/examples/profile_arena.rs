//! Cuánto tarda `#simular` en Rust, por nivel y con cuántos hilos.
//!
//!   cargo run --release --example profile_arena

use std::time::Instant;
use winsibot_session_api::arena::{simular, Nivel};

fn main() {
    let hilos = winsibot_session_api::anime4k::hilos();
    for nivel in [Nivel::Facil, Nivel::Normal, Nivel::Dificil] {
        for h in [1, hilos] {
            let t0 = Instant::now();
            let r = simular(nivel, 2000, 60_000, h, 42);
            let ms = t0.elapsed().as_secs_f64() * 1000.0;
            let resumen: Vec<String> = r
                .iter()
                .map(|c| format!("{:?} {:.1}% ({})", c.estilo, 100.0 * f64::from(c.victorias) / f64::from(c.peleas.max(1)), c.peleas))
                .collect();
            println!("{nivel:?} con {h:>2} hilos: {ms:>7.0} ms · {}", resumen.join(" · "));
        }
    }
}
