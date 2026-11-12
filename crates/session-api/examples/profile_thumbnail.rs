//! Lo que cuesta la miniatura de cada foto que manda el bot, por etapa.
//!
//!   cargo run --release -p winsibot-session-api --example profile_thumbnail -- <imagen>...
//!
//! Cada foto que sale (`#rw`, `#wimage`, el menú…) pasa por `/image/convert`
//! para su `jpegThumbnail` de 32 px (src/lib/mediaThumb.ts): decodificar la
//! imagen entera, achicarla y codificar el JPEG. Es lo que más corre de todo lo
//! de imágenes, así que es lo primero que hay que medir.

use std::time::Instant;
use winsibot_session_api::render::{ajustar, codificar, Ajuste, Formato};
use winsibot_session_api::sticker::decodificar;

fn mediana(mut v: Vec<f64>) -> f64 {
    v.sort_by(f64::total_cmp);
    v[v.len() / 2]
}

fn main() {
    let rutas: Vec<String> = std::env::args().skip(1).collect();
    assert!(!rutas.is_empty(), "uso: profile_thumbnail <imagen>...");
    println!(
        "{:<28} {:>9} {:>11} {:>8} {:>8} {:>8} {:>8}",
        "imagen", "KB", "tamaño", "decod", "achicar", "jpeg", "total"
    );
    let (mut td, mut ta, mut tj) = (0.0, 0.0, 0.0);
    for ruta in &rutas {
        let bytes = std::fs::read(ruta).expect("no pude leer");
        let img = decodificar(&bytes).expect("imagen inválida");
        let (w, h) = img.dimensions();
        let vueltas = 15;
        let (mut d, mut a, mut j) = (Vec::new(), Vec::new(), Vec::new());
        for _ in 0..vueltas {
            let t0 = Instant::now();
            let img = std::hint::black_box(decodificar(&bytes).unwrap());
            let t1 = Instant::now();
            let chica = ajustar(img, 32, 4096, Ajuste::Inside);
            let t2 = Instant::now();
            std::hint::black_box(codificar(&chica, Formato::Jpeg, 50).unwrap());
            let t3 = Instant::now();
            d.push((t1 - t0).as_secs_f64() * 1e3);
            a.push((t2 - t1).as_secs_f64() * 1e3);
            j.push((t3 - t2).as_secs_f64() * 1e3);
        }
        let (d, a, j) = (mediana(d), mediana(a), mediana(j));
        td += d;
        ta += a;
        tj += j;
        let nombre = std::path::Path::new(ruta)
            .file_name()
            .unwrap()
            .to_string_lossy();
        println!(
            "{:<28} {:>9.0} {:>11} {:>8.2} {:>8.2} {:>8.2} {:>8.2}",
            nombre,
            bytes.len() as f64 / 1024.0,
            format!("{w}x{h}"),
            d,
            a,
            j,
            d + a + j
        );
    }
    let n = rutas.len() as f64;
    println!(
        "\npromedio: decodificar {:.2} ms, achicar {:.2}, JPEG {:.2} — total {:.2} ms",
        td / n,
        ta / n,
        tj / n,
        (td + ta + tj) / n
    );
}
