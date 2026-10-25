//! `cluster` contra SQLite, con las cargas que tiene el bot.
//!
//!   cargo run --release -p winsibot-cluster --example compare
//!
//! SQLite va como en la Session API: WAL y `synchronous=NORMAL`, tabla
//! `WITHOUT ROWID` con la clave de primaria, sentencias preparadas. Es la misma
//! garantía que `Durabilidad::Proceso`: los dos sobreviven a que muera el
//! proceso, ninguno a un corte de luz.
//!
//! La regla de siempre: el motor no reemplaza nada si no gana por algo medible.

use std::path::{Path, PathBuf};
use std::time::Instant;

use cluster::{Lote, Motor, Opciones};
use rusqlite::{params, Connection};

struct Carga {
    nombre: &'static str,
    n: usize,
    largo_valor: usize,
    lote: usize,
}

fn carpeta(nombre: &str) -> PathBuf {
    let p = std::env::temp_dir().join(format!("winsi-comparar-{nombre}-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&p);
    std::fs::create_dir_all(&p).unwrap();
    p
}

fn tam_carpeta(p: &Path) -> u64 {
    std::fs::read_dir(p).unwrap().map(|e| e.unwrap().metadata().unwrap().len()).sum()
}

fn clave(i: usize) -> Vec<u8> {
    // Como un id de mensaje de WhatsApp: 20 caracteres hex.
    format!("3EB0{:016X}", (i as u64).wrapping_mul(0x9e37_79b9_7f4a_7c15)).into_bytes()
}

fn valor(i: usize, largo: usize) -> Vec<u8> {
    let mut v = format!("{{\"n\":{i},\"datos\":\"").into_bytes();
    v.resize(largo.saturating_sub(2), b'x');
    v.extend_from_slice(b"\"}");
    v
}

/// µs por operación.
fn por_op(t: Instant, n: usize) -> f64 {
    t.elapsed().as_secs_f64() * 1e6 / n as f64
}

struct Resultado {
    suelta: f64,
    lotes: f64,
    leer_si: f64,
    leer_no: f64,
    prefijo_ms: f64,
    reabrir_ms: f64,
    disco_mb: f64,
}

/// CLUSTER_CACHE_MB: la RAM de la caché de bloques, para compararla con la
/// misma que se le da a SQLite.
fn opciones() -> Opciones {
    let mut o = Opciones::default();
    if let Some(mb) = std::env::var("CLUSTER_CACHE_MB").ok().and_then(|v| v.parse::<usize>().ok()) {
        o.cache_bytes = mb << 20;
    }
    o
}

fn medir_cluster(c: &Carga) -> Resultado {
    let dir = carpeta(&format!("cluster-{}", c.nombre));
    let suelta_n = c.n.min(20_000);

    let mut m = Motor::abrir(&dir, opciones()).unwrap();
    let t = Instant::now();
    for i in 0..suelta_n {
        m.poner(&clave(i), &valor(i, c.largo_valor)).unwrap();
    }
    let suelta = por_op(t, suelta_n);

    let t = Instant::now();
    let mut i = suelta_n;
    while i < c.n {
        let mut l = Lote::new();
        for j in i..(i + c.lote).min(c.n) {
            l.poner(&clave(j), &valor(j, c.largo_valor));
        }
        m.escribir(&l).unwrap();
        i += c.lote;
    }
    let lotes = por_op(t, c.n - suelta_n);
    m.vaciar().unwrap();
    m.compactar().unwrap();

    let consultas = 50_000;
    let t = Instant::now();
    for q in 0..consultas {
        let i = (q * 7919) % c.n;
        assert!(m.leer(&clave(i)).unwrap().is_some());
    }
    let leer_si = por_op(t, consultas);
    let t = Instant::now();
    for q in 0..consultas {
        assert!(m.leer(&clave(c.n + q)).unwrap().is_none());
    }
    let leer_no = por_op(t, consultas);

    let t = Instant::now();
    let r = m.prefijo(b"3EB0A").unwrap();
    let prefijo_ms = t.elapsed().as_secs_f64() * 1e3;
    assert!(!r.is_empty());

    drop(m);
    let t = Instant::now();
    let m = Motor::abrir(&dir, opciones()).unwrap();
    let reabrir_ms = t.elapsed().as_secs_f64() * 1e3;
    drop(m);
    let disco_mb = tam_carpeta(&dir) as f64 / 1e6;
    let _ = std::fs::remove_dir_all(&dir);
    Resultado { suelta, lotes, leer_si, leer_no, prefijo_ms, reabrir_ms, disco_mb }
}

fn abrir_sqlite(dir: &Path) -> Connection {
    let db = Connection::open(dir.join("kv.db")).unwrap();
    db.execute_batch(
        "PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;
         CREATE TABLE IF NOT EXISTS kv (k BLOB PRIMARY KEY, v BLOB NOT NULL) WITHOUT ROWID;",
    )
    .unwrap();
    // Para darle a SQLite otra configuración y ver si la comparación cambia,
    // p. ej. SQLITE_PRAGMAS="PRAGMA cache_size=-65536; PRAGMA wal_autocheckpoint=4000;"
    if let Ok(extra) = std::env::var("SQLITE_PRAGMAS") {
        db.execute_batch(&extra).unwrap();
    }
    db
}

fn medir_sqlite(c: &Carga) -> Resultado {
    let dir = carpeta(&format!("sqlite-{}", c.nombre));
    let suelta_n = c.n.min(20_000);

    let mut db = abrir_sqlite(&dir);
    let t = Instant::now();
    for i in 0..suelta_n {
        db.prepare_cached("INSERT OR REPLACE INTO kv (k, v) VALUES (?1, ?2)")
            .unwrap()
            .execute(params![clave(i), valor(i, c.largo_valor)])
            .unwrap();
    }
    let suelta = por_op(t, suelta_n);

    let t = Instant::now();
    let mut i = suelta_n;
    while i < c.n {
        let tx = db.transaction().unwrap();
        {
            let mut st = tx.prepare_cached("INSERT OR REPLACE INTO kv (k, v) VALUES (?1, ?2)").unwrap();
            for j in i..(i + c.lote).min(c.n) {
                st.execute(params![clave(j), valor(j, c.largo_valor)]).unwrap();
            }
        }
        tx.commit().unwrap();
        i += c.lote;
    }
    let lotes = por_op(t, c.n - suelta_n);
    db.execute_batch("PRAGMA wal_checkpoint(TRUNCATE);").unwrap();

    let consultas = 50_000;
    let leer = |db: &Connection, k: Vec<u8>| -> Option<Vec<u8>> {
        db.prepare_cached("SELECT v FROM kv WHERE k = ?1")
            .unwrap()
            .query_row(params![k], |r| r.get(0))
            .ok()
    };
    let t = Instant::now();
    for q in 0..consultas {
        assert!(leer(&db, clave((q * 7919) % c.n)).is_some());
    }
    let leer_si = por_op(t, consultas);
    let t = Instant::now();
    for q in 0..consultas {
        assert!(leer(&db, clave(c.n + q)).is_none());
    }
    let leer_no = por_op(t, consultas);

    let t = Instant::now();
    let filas: Vec<(Vec<u8>, Vec<u8>)> = db
        .prepare("SELECT k, v FROM kv WHERE k >= ?1 AND k < ?2 ORDER BY k")
        .unwrap()
        .query_map(params![b"3EB0A".to_vec(), b"3EB0B".to_vec()], |r| Ok((r.get(0)?, r.get(1)?)))
        .unwrap()
        .map(|r| r.unwrap())
        .collect();
    let prefijo_ms = t.elapsed().as_secs_f64() * 1e3;
    assert!(!filas.is_empty());

    drop(db);
    let t = Instant::now();
    let db = abrir_sqlite(&dir);
    let _: i64 = db.query_row("SELECT count(*) FROM kv WHERE k = x'00'", [], |r| r.get(0)).unwrap();
    let reabrir_ms = t.elapsed().as_secs_f64() * 1e3;
    drop(db);
    let disco_mb = tam_carpeta(&dir) as f64 / 1e6;
    let _ = std::fs::remove_dir_all(&dir);
    Resultado { suelta, lotes, leer_si, leer_no, prefijo_ms, reabrir_ms, disco_mb }
}

fn main() {
    let cargas = [
        Carga { nombre: "dedup", n: 200_000, largo_valor: 8, lote: 1000 },
        Carga { nombre: "usuarios", n: 30_000, largo_valor: 900, lote: 50 },
    ];
    for c in &cargas {
        // Una ronda de calentamiento de cada uno, y la segunda es la que vale.
        let _ = (medir_cluster(c), medir_sqlite(c));
        let a = medir_cluster(c);
        let b = medir_sqlite(c);
        println!("\n== {} — {} claves, valores de {} B, lotes de {} ==", c.nombre, c.n, c.largo_valor, c.lote);
        println!("{:<28}{:>12}{:>12}{:>9}", "", "cluster", "sqlite", "x");
        let fila = |n: &str, x: f64, y: f64, u: &str| println!("{n:<28}{:>9.2} {u:<2}{:>9.2} {u:<2}{:>8.2}x", x, y, y / x);
        fila("escribir de a una", a.suelta, b.suelta, "µs");
        fila("escribir en lotes", a.lotes, b.lotes, "µs");
        fila("leer clave que existe", a.leer_si, b.leer_si, "µs");
        fila("leer clave que no existe", a.leer_no, b.leer_no, "µs");
        fila("rango por prefijo", a.prefijo_ms, b.prefijo_ms, "ms");
        fila("reabrir", a.reabrir_ms, b.reabrir_ms, "ms");
        fila("en disco", a.disco_mb, b.disco_mb, "MB");
    }
    println!("\n(x > 1: cluster gana por ese factor; x < 1: gana SQLite)");
}
