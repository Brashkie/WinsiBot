//! Los kernels de Anime4K en Rust, C y Zig, sobre la misma imagen.
//!
//!   cargo bench -p winsibot-session-api --features native --bench anime4k
//!
//! Lo que gane acá es lo que va en `MEDIDO` de src/anime4k.rs. Sin la feature
//! `native` solo se mide Rust.

use criterion::{black_box, criterion_group, criterion_main, Criterion};
use image::RgbaImage;
use winsibot_session_api::anime4k::{self, A4K_FUERZA_COLOR, A4K_FUERZA_GRADIENTE};

/// 1024x768: lo que procesa `#upscale` x2 sobre una foto de 512x384. Mitad
/// ruido y mitad zonas planas, con el alfa ya cargado de luminancia.
fn imagen() -> RgbaImage {
    let mut s: u64 = 0x9E37_79B9_7F4A_7C15;
    let mut img = RgbaImage::new(1024, 768);
    for (x, y, p) in img.enumerate_pixels_mut() {
        s ^= s << 13;
        s ^= s >> 7;
        s ^= s << 17;
        let plano = (x / 32 + y / 32) % 2 == 0;
        let v = if plano {
            [120, 80, 60]
        } else {
            [s as u8, (s >> 8) as u8, (s >> 16) as u8]
        };
        *p = image::Rgba([v[0], v[1], v[2], 0]);
        p[3] = anime4k::luminancia(p);
    }
    img
}

fn kernels(c: &mut Criterion) {
    let img = imagen();

    let mut g = c.benchmark_group("push_color");
    g.bench_function("rust", |b| {
        b.iter(|| anime4k::push_color_rust(black_box(&img), A4K_FUERZA_COLOR))
    });
    #[cfg(feature = "native")]
    g.bench_function("c", |b| {
        b.iter(|| anime4k::push_color_c(black_box(&img), A4K_FUERZA_COLOR))
    });
    #[cfg(feature = "native")]
    g.bench_function("zig", |b| {
        b.iter(|| anime4k::push_color_zig(black_box(&img), A4K_FUERZA_COLOR))
    });
    g.finish();

    let mut g = c.benchmark_group("gradiente");
    g.bench_function("rust", |b| {
        b.iter(|| anime4k::gradiente_rust(black_box(&img)))
    });
    #[cfg(feature = "native")]
    g.bench_function("c", |b| b.iter(|| anime4k::gradiente_c(black_box(&img))));
    #[cfg(feature = "native")]
    g.bench_function("zig", |b| {
        b.iter(|| anime4k::gradiente_zig(black_box(&img)))
    });
    g.finish();

    let mut g = c.benchmark_group("push_gradient");
    g.bench_function("rust", |b| {
        b.iter(|| anime4k::push_gradient_rust(black_box(&img), A4K_FUERZA_GRADIENTE))
    });
    #[cfg(feature = "native")]
    g.bench_function("c", |b| {
        b.iter(|| anime4k::push_gradient_c(black_box(&img), A4K_FUERZA_GRADIENTE))
    });
    #[cfg(feature = "native")]
    g.bench_function("zig", |b| {
        b.iter(|| anime4k::push_gradient_zig(black_box(&img), A4K_FUERZA_GRADIENTE))
    });
    g.finish();

    // Una pasada entera de Anime4K: los tres kernels por separado contra la
    // pasada en un solo kernel de Zig, sin imágenes intermedias (8.18.0).
    let mut g = c.benchmark_group("pasada");
    g.bench_function("rust", |b| {
        b.iter(|| {
            let pc = anime4k::push_color_rust(black_box(&img), A4K_FUERZA_COLOR);
            anime4k::push_gradient_rust(&anime4k::gradiente_rust(&pc), A4K_FUERZA_GRADIENTE)
        })
    });
    #[cfg(feature = "native")]
    g.bench_function("zig_por_etapas", |b| {
        b.iter(|| {
            let pc = anime4k::push_color_zig(black_box(&img), A4K_FUERZA_COLOR);
            anime4k::gradiente_y_push_zig(&pc, A4K_FUERZA_GRADIENTE)
        })
    });
    #[cfg(feature = "native")]
    g.bench_function("zig_fusionada", |b| {
        b.iter(|| anime4k::pasada_zig(black_box(&img), A4K_FUERZA_COLOR, A4K_FUERZA_GRADIENTE, false))
    });
    g.finish();
}

criterion_group!(benches, kernels);
criterion_main!(benches);
