//! Lo que la Session API escribe por CADA mensaje de grupo, sin HTTP de por
//! medio: guardar el mensaje observado (`/ai/observe`) y actualizar la memoria
//! del remitente (`/ai/memory/:jid/update`).
//!
//!   cargo bench -p winsibot-session-api --bench mensaje
//!
//! Ojo con lo que mide: la base crece con cada iteración de Criterion hasta
//! millones de filas, así que los números absolutos salen inflados. Para el
//! antes y el después sobre una base de tamaño realista está
//! `examples/perfil_mensaje.rs`: con 300.000 filas, de ~297 a ~66 µs por
//! mensaje.
//!
//! Sobre una base en una carpeta temporal, con el mismo esquema que la real.

use criterion::{black_box, criterion_group, criterion_main, Criterion};
use winsibot_session_api::{conversations, user_memory};

fn base() -> conversations::ConvDb {
    let dir = std::env::temp_dir().join(format!("winsi-bench-msg-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();
    let db = conversations::init(dir.join("conv.db").to_str().unwrap()).unwrap();
    user_memory::init_schema(&db);
    db
}

const TEXTOS: [&str; 4] = [
    "hola bot como estas",
    "jajaja que buena",
    "alguien juega hoy?",
    "buenas noches a todos",
];

fn mensaje(c: &mut Criterion) {
    let db = base();
    let mut g = c.benchmark_group("por mensaje");

    // Un mensaje de grupo completo, como lo ve la API: se observa, se
    // actualiza la memoria del remitente, y cada 64 mensajes —lo que llega en
    // un segundo con tráfico— se vacía todo en una transacción. El tiempo
    // incluye la parte que le toca de ese vaciado.
    let mut i = 0u64;
    g.bench_function(
        "mensaje de grupo (observar + memoria + vaciado cada 64)",
        |b| {
            b.iter(|| {
                i += 1;
                let sender = format!("{}@s.whatsapp.net", i % 500);
                conversations::observar(
                    &db,
                    conversations::ObserveRequest {
                        sender: sender.clone(),
                        gjid: format!("{}@g.us", i % 40),
                        text: format!("{} {i}", TEXTOS[(i % 4) as usize]),
                    },
                );
                let req = user_memory::UpdateRequest {
                    text: TEXTOS[(i % 4) as usize].to_string(),
                    intent: "neutral".into(),
                    is_cmd: false,
                };
                black_box(user_memory::actualizar(&db, &sender, &req).unwrap());
                if i.is_multiple_of(64) {
                    db.vaciar_pendientes();
                }
            })
        },
    );
    g.finish();
}

criterion_group!(benches, mensaje);
criterion_main!(benches);
