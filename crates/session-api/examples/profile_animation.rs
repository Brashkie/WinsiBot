//! Cuánto tarda un sticker animado y el MJPEG de #toimg (ver animation.rs).
//!
//!   cargo run --release -p winsibot-session-api --features native --example profile_animation -- anim.gif [salida/]
//!
//! La mediana de 5. Con una carpeta de salida deja ahí `sticker.webp` y
//! `cuadros.mjpeg`, para mirarlos o pasarlos por ffmpeg.

use std::time::Instant;
use winsibot_session_api::animation;

fn mediana(mut v: Vec<f64>) -> f64 {
    v.sort_by(f64::total_cmp);
    v[v.len() / 2]
}

fn main() {
    let mut args = std::env::args().skip(1);
    let ruta = args.next().expect("falta el GIF o WebP animado");
    let salida = args.next();
    let b = std::fs::read(&ruta).expect("no pude leer la animación");
    println!(
        "plataforma: {}",
        winsibot_session_api::platform::detect().summary()
    );

    let (mut ts, mut tm) = (Vec::new(), Vec::new());
    let (mut webp, mut mjpeg) = (Vec::new(), Vec::new());
    for _ in 0..5 {
        let t = Instant::now();
        webp = animation::sticker_animado(&b, 50.0, true).unwrap();
        ts.push(t.elapsed().as_secs_f64() * 1e3);
        let t = Instant::now();
        mjpeg = animation::a_mjpeg(&b, 15).unwrap();
        tm.push(t.elapsed().as_secs_f64() * 1e3);
    }
    println!(
        "{ruta}: sticker animado {:.1} ms · {} KB · MJPEG a 15 fps {:.1} ms · {} KB",
        mediana(ts),
        webp.len() / 1024,
        mediana(tm),
        mjpeg.len() / 1024
    );
    if let Some(dir) = salida {
        std::fs::write(format!("{dir}/sticker.webp"), &webp).unwrap();
        std::fs::write(format!("{dir}/cuadros.mjpeg"), &mjpeg).unwrap();
    }
}
