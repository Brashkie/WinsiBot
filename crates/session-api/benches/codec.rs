//! Codificar la salida de un comando de imagen: PNG contra JPEG, y el JPEG
//! del crate `image` contra el propio en C y Zig.
//!
//!   cargo bench -p winsibot-session-api --features native --bench codec
//!
//! Sobre media/WinsiBot.png, 1536x1024: una imagen real del proyecto, con
//! texto, degradados y bordes, que es lo que producen #lego y #upscale.

use criterion::{black_box, criterion_group, criterion_main, Criterion};
use image::codecs::png::{CompressionType, FilterType, PngEncoder};
use image::ImageEncoder;
use winsibot_session_api::jpeg;

fn png(img: &image::RgbImage, c: CompressionType) -> Vec<u8> {
    let mut v = Vec::new();
    PngEncoder::new_with_quality(&mut v, c, FilterType::Adaptive)
        .write_image(
            img.as_raw(),
            img.width(),
            img.height(),
            image::ExtendedColorType::Rgb8,
        )
        .unwrap();
    v
}

fn codec(c: &mut Criterion) {
    let img = image::load_from_memory(include_bytes!("../../../media/WinsiBot.png"))
        .unwrap()
        .to_rgb8();

    let mut g = c.benchmark_group("salida 1536x1024");
    g.sample_size(20);
    g.bench_function("png por defecto", |b| {
        b.iter(|| png(black_box(&img), CompressionType::Default))
    });
    g.bench_function("png rapido", |b| {
        b.iter(|| png(black_box(&img), CompressionType::Fast))
    });
    g.bench_function("jpeg crate image", |b| {
        b.iter(|| jpeg::codificar_image(black_box(&img), jpeg::CALIDAD))
    });
    #[cfg(feature = "native")]
    g.bench_function("jpeg c+zig", |b| {
        b.iter(|| jpeg::codificar_nativo(black_box(&img), jpeg::CALIDAD))
    });
    g.finish();

    eprintln!(
        "\n  tamaños: png {} KB · jpeg image {} KB",
        png(&img, CompressionType::Default).len() / 1024,
        jpeg::codificar_image(&img, jpeg::CALIDAD).len() / 1024
    );
    #[cfg(feature = "native")]
    eprintln!(
        "  jpeg c+zig {} KB",
        jpeg::codificar_nativo(&img, jpeg::CALIDAD).len() / 1024
    );
}

criterion_group!(benches, codec);
criterion_main!(benches);
