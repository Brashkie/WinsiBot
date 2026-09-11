//! SQLite contra "cargar un log en memoria", en el patrón real del outbox.
//!
//! La pregunta que responde: para guardar el outbox, ¿conviene SQLite o un log
//! binario tipo AOF que se carga entero en memoria al arrancar?
//!
//! Se mide la consulta que de verdad hace `replayOutbox()`:
//!
//!     los mensajes encolados sin enviar, con menos de N reintentos,
//!     los más antiguos primero, máximo 100
//!
//! En SQLite eso es un SELECT con índice. Con un AOF hay que recorrer todo lo
//! cargado, filtrar, ordenar y cortar — sin índices, porque un log no los tiene.
//!
//!   cargo bench --bench storage

use criterion::{black_box, criterion_group, criterion_main, BenchmarkId, Criterion};
use rusqlite::{params, Connection};

const QUEUED: i64 = -2;

/// Lo que tendrías en RAM si el outbox fuera un AOF cargado al arrancar.
#[derive(Clone)]
struct Row {
    id:          String,
    status:      i64,
    retry_count: i64,
    sent_at:     i64,
}

fn seed(n: usize) -> Vec<Row> {
    (0..n).map(|i| Row {
        id:          format!("MSG_{i:08}"),
        // 1 de cada 50 quedó sin enviar: proporción realista — la inmensa
        // mayoría de los mensajes SÍ salen.
        status:      if i % 50 == 0 { QUEUED } else { 0 },
        retry_count: (i % 5) as i64,
        sent_at:     1_700_000_000 + i as i64,
    }).collect()
}

fn sqlite_with(rows: &[Row]) -> Connection {
    let conn = Connection::open_in_memory().unwrap();
    conn.execute_batch(
        "CREATE TABLE outbox (
             id TEXT PRIMARY KEY, status INTEGER, retry_count INTEGER, sent_at INTEGER
         );
         CREATE INDEX idx ON outbox (status, sent_at);",
    ).unwrap();
    let tx = conn.unchecked_transaction().unwrap();
    for r in rows {
        tx.execute(
            "INSERT INTO outbox (id, status, retry_count, sent_at) VALUES (?1, ?2, ?3, ?4)",
            params![r.id, r.status, r.retry_count, r.sent_at],
        ).unwrap();
    }
    tx.commit().unwrap();
    conn
}

/// La consulta real de replayOutbox, resuelta sobre SQLite con índice.
fn query_sqlite(conn: &Connection) -> usize {
    let mut stmt = conn.prepare_cached(
        "SELECT id FROM outbox
          WHERE status = ?1 AND retry_count < ?2
          ORDER BY sent_at ASC LIMIT 100",
    ).unwrap();
    let rows = stmt.query_map(params![QUEUED, 3i64], |r| r.get::<_, String>(0)).unwrap();
    rows.count()
}

/// La misma consulta, resuelta a mano sobre lo que un AOF deja en memoria.
fn query_memory(rows: &[Row]) -> usize {
    let mut hits: Vec<&Row> = rows.iter()
        .filter(|r| r.status == QUEUED && r.retry_count < 3)
        .collect();
    hits.sort_by_key(|r| r.sent_at);
    hits.truncate(100);
    hits.len()
}

fn bench_query(c: &mut Criterion) {
    let mut group = c.benchmark_group("outbox_query");

    for n in [1_000usize, 50_000, 500_000] {
        let rows = seed(n);
        let conn = sqlite_with(&rows);

        group.bench_with_input(BenchmarkId::new("sqlite_indice", n), &n, |b, _| {
            b.iter(|| black_box(query_sqlite(black_box(&conn))))
        });
        group.bench_with_input(BenchmarkId::new("memoria_scan", n), &n, |b, _| {
            b.iter(|| black_box(query_memory(black_box(&rows))))
        });
    }
    group.finish();
}

/// La otra operación del outbox: marcar UNO como enviado.
/// En SQLite es un UPDATE por clave primaria. En un AOF hay que apendear un
/// registro nuevo y, tarde o temprano, compactar.
fn bench_update(c: &mut Criterion) {
    let mut group = c.benchmark_group("outbox_update_uno");

    let rows = seed(50_000);
    let conn = sqlite_with(&rows);
    let mut i = 0usize;
    group.bench_function("sqlite_update_por_pk", |b| {
        b.iter(|| {
            i = (i + 1) % 50_000;
            let id = format!("MSG_{i:08}");
            black_box(conn.execute(
                "UPDATE outbox SET status = 0 WHERE id = ?1",
                params![id],
            ).unwrap())
        })
    });

    group.finish();
}

criterion_group!(benches, bench_query, bench_update);
criterion_main!(benches);
