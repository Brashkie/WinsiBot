//! Benchmarks del camino más caliente del proceso.
//!
//! `check()` corre por CADA mensaje y `spam_check()` por cada comando, así que
//! su coste se multiplica por el volumen del bot. Criterion mide con rigor
//! estadístico (calienta, repite, descarta outliers y reporta intervalos de
//! confianza), a diferencia de un `Instant::now()` a mano.
//!
//!   cargo bench --bench rate_limiter
//!
//! Los informes HTML quedan en rust/target/criterion/.
//!
//! Nota sobre qué se mide: esto es la función pura, sin HTTP. Lo que paga Node
//! por llamada es esto MÁS el round-trip, que es de otro orden de magnitud —
//! por eso importa que cada mensaje haga una sola llamada y no varias.

use criterion::{black_box, criterion_group, criterion_main, BenchmarkId, Criterion};
use winsibot_session_api::rate_limiter::RateLimiter;

/// Caso real: muchos senders distintos, cada uno tocando su propia entrada.
/// Es el patrón para el que se eligió DashMap (shards independientes).
fn senders(n: usize) -> Vec<String> {
    (0..n).map(|i| format!("52199{:08}@s.whatsapp.net", i)).collect()
}

fn bench_check(c: &mut Criterion) {
    let mut group = c.benchmark_group("check");

    // Un solo sender: el peor caso de contención sobre un mismo shard.
    let rl = RateLimiter::new();
    group.bench_function("un_sender", |b| {
        b.iter(|| black_box(rl.check(black_box("5219999@s.whatsapp.net"))))
    });

    // Muchos senders: el caso real de un grupo activo.
    for n in [100usize, 10_000] {
        let rl   = RateLimiter::new();
        let ids  = senders(n);
        let mut i = 0usize;
        group.bench_with_input(BenchmarkId::new("n_senders", n), &n, |b, _| {
            b.iter(|| {
                i = (i + 1) % ids.len();
                black_box(rl.check(black_box(&ids[i])))
            })
        });
    }

    group.finish();
}

fn bench_spam_check(c: &mut Criterion) {
    let mut group = c.benchmark_group("spam_check");

    // Texto distinto cada vez: el camino normal, sin flood.
    // Los textos se generan ANTES del iter() — con un format! dentro se estaría
    // midiendo también la asignación del String, que no es parte de la función.
    let rl    = RateLimiter::new();
    let textos: Vec<String> = (0..1_000).map(|i| format!("mensaje numero {i}")).collect();
    let mut i = 0usize;
    group.bench_function("texto_distinto", |b| {
        b.iter(|| {
            i = (i + 1) % textos.len();
            black_box(rl.spam_check(
                black_box("5219999@s.whatsapp.net"),
                black_box(&textos[i]),
                1_000_000,   // límites altos: se mide el coste, no el bloqueo
                5_000,
                1_000_000,
                30_000,
            ))
        })
    });

    // Mismo texto: ejercita la búsqueda lineal en el tracker de repetidos.
    let rl2 = RateLimiter::new();
    group.bench_function("texto_repetido", |b| {
        b.iter(|| {
            black_box(rl2.spam_check(
                black_box("5218888@s.whatsapp.net"),
                black_box("COMPRA SEGUIDORES BARATO AHORA"),
                1_000_000,
                5_000,
                1_000_000,
                30_000,
            ))
        })
    });

    // Texto largo: el hash recorre hasta 512 bytes, así que conviene ver
    // cuánto cambia respecto a un mensaje corto.
    let rl3  = RateLimiter::new();
    let long = "x".repeat(4_000);
    group.bench_function("texto_largo_4kb", |b| {
        b.iter(|| {
            black_box(rl3.spam_check(
                black_box("5217777@s.whatsapp.net"),
                black_box(&long),
                1_000_000,
                5_000,
                1_000_000,
                30_000,
            ))
        })
    });

    group.finish();
}

criterion_group!(benches, bench_check, bench_spam_check);
criterion_main!(benches);
