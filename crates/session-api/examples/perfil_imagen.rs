//! Dónde se van los milisegundos de los comandos de imagen, por etapa.
//!
//!   cargo run --release -p winsibot-session-api --example perfil_imagen -- <imagen>
//!
//! Antes de escribir un kernel en C o en Zig hay que saber qué fracción del
//! tiempo es cálculo propio y qué fracción es decodificar y codificar la
//! imagen, que hace el crate `image`. Si el cálculo propio es el 10%, hacerlo
//! infinitamente rápido da como mucho 1,1x.

use std::time::Instant;

fn medir<T>(vueltas: u32, mut f: impl FnMut() -> T) -> f64 {
    let mut t = Vec::new();
    for _ in 0..vueltas {
        let t0 = Instant::now();
        std::hint::black_box(f());
        t.push(t0.elapsed().as_secs_f64() * 1000.0);
    }
    t.sort_by(|a, b| a.partial_cmp(b).unwrap());
    t[t.len() / 2]
}

fn main() {
    let ruta = std::env::args()
        .nth(1)
        .expect("uso: perfil_imagen <imagen>");
    let bytes = std::fs::read(&ruta).expect("no pude leer la imagen");
    let img = image::load_from_memory(&bytes).expect("imagen inválida");
    println!(
        "  {ruta}: {}x{}, {} KB\n",
        img.width(),
        img.height(),
        bytes.len() / 1024
    );

    let decodificar = medir(15, || image::load_from_memory(&bytes).unwrap());
    let a_rgb = medir(15, || img.to_rgb8());
    let rgb = img.to_rgb8();
    let codificar = medir(15, || {
        let mut v = Vec::new();
        image::DynamicImage::ImageRgb8(rgb.clone())
            .write_to(&mut std::io::Cursor::new(&mut v), image::ImageFormat::Png)
            .unwrap();
        v
    });
    let png_con = |c: image::codecs::png::CompressionType| {
        let mut v = Vec::new();
        let enc = image::codecs::png::PngEncoder::new_with_quality(
            &mut v,
            c,
            image::codecs::png::FilterType::Adaptive,
        );
        image::ImageEncoder::write_image(
            enc,
            rgb.as_raw(),
            rgb.width(),
            rgb.height(),
            image::ExtendedColorType::Rgb8,
        )
        .unwrap();
        v
    };
    let png_rapido = medir(15, || png_con(image::codecs::png::CompressionType::Fast));
    let kb_def = png_con(image::codecs::png::CompressionType::Default).len() / 1024;
    let kb_rap = png_con(image::codecs::png::CompressionType::Fast).len() / 1024;
    let jpeg = |q: u8| {
        let mut v = Vec::new();
        let enc = image::codecs::jpeg::JpegEncoder::new_with_quality(&mut v, q);
        image::ImageEncoder::write_image(
            enc,
            rgb.as_raw(),
            rgb.width(),
            rgb.height(),
            image::ExtendedColorType::Rgb8,
        )
        .unwrap();
        v
    };
    let jpeg90 = medir(15, || jpeg(90));
    let kb_jpg = jpeg(90).len() / 1024;
    // La entrada real: las fotos llegan de WhatsApp como JPEG.
    let entrada_jpeg = jpeg(85);
    let decodificar_jpeg = medir(15, || image::load_from_memory(&entrada_jpeg).unwrap());
    let lego = medir(15, || {
        winsibot_session_api::imagefx::legofy(&bytes, 20)
            .unwrap()
            .codificar()
    });

    println!("  etapa                              ms");
    println!(
        "  decodificar ({})            {decodificar:8.2}",
        if bytes.starts_with(&[0x89, b'P']) {
            "PNG "
        } else {
            "JPEG"
        }
    );
    println!(
        "  decodificar la misma como JPEG {decodificar_jpeg:8.2}   (lo que llega de WhatsApp)"
    );
    println!("  convertir a RGB                {a_rgb:8.2}");
    println!("  codificar PNG del tamaño entero {codificar:7.2}");
    println!("  #lego completo (ficha 20)      {lego:8.2}");
    println!();
    println!("  salida del tamaño entero       ms      KB");
    println!("  PNG por defecto            {codificar:8.2} {kb_def:7}");
    println!("  PNG rápido                 {png_rapido:8.2} {kb_rap:7}");
    println!("  JPEG calidad 90            {jpeg90:8.2} {kb_jpg:7}");
}
