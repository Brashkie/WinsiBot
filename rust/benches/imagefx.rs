//! Benchmark del mosaico LEGO.
//!
//! Existe para poder comparar contra la implementación que había en Python
//! (Pillow + numpy) midiendo lo mismo: la función pelada, sin HTTP ni base64.
//! La primera comparación que hice medía el endpoint de Rust contra la función
//! de Python y daba a Python por ganador — pero el endpoint incluye el
//! round-trip y codificar 660 KB en base64, que no es lo que se está portando.

use criterion::{criterion_group, criterion_main, BatchSize, Criterion};
use image::{DynamicImage, RgbImage};
use winsibot_session_api::imagefx::legofy;

/// Genera un PNG con un degradado, para que las fichas no salgan todas del
/// mismo color: con una imagen plana el cuantizado siempre acierta el mismo
/// color de la paleta y la medición saldría optimista.
fn png_degradado(w: u32, h: u32) -> Vec<u8> {
    let mut img = RgbImage::new(w, h);
    for (x, y, p) in img.enumerate_pixels_mut() {
        *p = image::Rgb([
            ((x * 255) / w.max(1)) as u8,
            ((y * 255) / h.max(1)) as u8,
            (((x + y) * 255) / (w + h).max(1)) as u8,
        ]);
    }
    let mut buf = Vec::new();
    DynamicImage::ImageRgb8(img)
        .write_to(&mut std::io::Cursor::new(&mut buf), image::ImageFormat::Png)
        .unwrap();
    buf
}

fn bench_legofy(c: &mut Criterion) {
    let mut g = c.benchmark_group("legofy");
    // 84 ms por iteración: con las 100 muestras por defecto esto tardaría
    // minutos y nadie lo correría.
    g.sample_size(20);

    // El tamaño real de una foto de WhatsApp después del recorte de entrada.
    let foto = png_degradado(1280, 851);
    g.bench_function("1280x851 ficha=20", |b| {
        b.iter_batched(|| foto.clone(), |p| legofy(&p, 20).unwrap(), BatchSize::SmallInput)
    });

    // Ficha chica = más celdas = más studs que dibujar. Es el peor caso real.
    g.bench_function("1280x851 ficha=8", |b| {
        b.iter_batched(|| foto.clone(), |p| legofy(&p, 8).unwrap(), BatchSize::SmallInput)
    });

    // Por encima de MAX_INPUT_SIDE se paga además el redimensionado Lanczos3.
    let grande = png_degradado(2400, 1600);
    g.bench_function("2400x1600 (se reduce a 1024)", |b| {
        b.iter_batched(|| grande.clone(), |p| legofy(&p, 20).unwrap(), BatchSize::SmallInput)
    });

    g.finish();
}

criterion_group!(benches, bench_legofy);
criterion_main!(benches);
