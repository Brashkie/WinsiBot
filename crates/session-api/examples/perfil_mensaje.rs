//! Lo que cuesta escribir un mensaje de grupo en la base de conversaciones,
//! antes y después de la escritura diferida (8.16.0), sobre una base con
//! 300.000 mensajes como la de un bot en uso.
//!
//!   cargo run --release -p winsibot-session-api --example perfil_mensaje
//!
//! "Antes" reproduce lo que hacía la API: por cada mensaje, un INSERT del
//! mensaje observado y un SELECT + UPSERT de la memoria del remitente, cada
//! uno en su propia transacción. "Después" es el código actual: se encola, se
//! actualiza la memoria en caché, y se vacía cada 64 mensajes en una
//! transacción.

use rusqlite::params;
use std::time::Instant;
use winsibot_session_api::{conversations, user_memory};

const PREVIOS: usize = 300_000;
const MENSAJES: u64 = 6_400;

fn base(nombre: &str) -> conversations::ConvDb {
    let dir = std::env::temp_dir().join(format!("perfil-msg-{}-{nombre}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();
    let db = conversations::init(dir.join("c.db").to_str().unwrap()).unwrap();
    user_memory::init_schema(&db);
    let mut conn = db.lock().unwrap();
    let tx = conn.transaction().unwrap();
    for i in 0..PREVIOS {
        tx.prepare_cached(
            "INSERT INTO conversations (sender, gjid, text, ts) VALUES (?1, ?2, ?3, ?4)",
        )
        .unwrap()
        .execute(params![
            format!("{}@s", i % 3000),
            format!("{}@g", i % 400),
            "mensaje viejo",
            i as i64
        ])
        .unwrap();
    }
    tx.commit().unwrap();
    drop(conn);
    db
}

fn main() {
    println!("\n  base con {PREVIOS} mensajes previos, {MENSAJES} mensajes nuevos\n");

    // ── Antes ────────────────────────────────────────────────────────────────
    let db = base("antes");
    let t = Instant::now();
    for i in 0..MENSAJES {
        let sender = format!("{}@s", i % 500);
        let conn = db.lock().unwrap();
        conn.execute(
            "INSERT INTO conversations (sender, gjid, text, intent, reply, mode, ts, len, has_emoji)
             VALUES (?1, ?2, ?3, 'observed', '', 'observed', ?4, ?5, 0)",
            params![sender, "1@g", "hola que tal", i as i64, 12],
        )
        .unwrap();
        let n: i64 = conn
            .query_row(
                "SELECT COALESCE(MAX(msg_count), 0) FROM user_memory WHERE jid = ?1",
                params![sender],
                |r| r.get(0),
            )
            .unwrap();
        conn.execute(
            "INSERT INTO user_memory (jid, msg_count, top_intents, active_hours, recent_intents, reputation, reputation_score, response_style)
             VALUES (?1, ?2, '{}', '[]', '[]', 'normal', 50, 'neutral')
             ON CONFLICT(jid) DO UPDATE SET msg_count = excluded.msg_count",
            params![sender, n + 1],
        )
        .unwrap();
    }
    let antes = t.elapsed().as_secs_f64() * 1e6 / MENSAJES as f64;

    // ── Después ──────────────────────────────────────────────────────────────
    let db = base("despues");
    let t = Instant::now();
    for i in 0..MENSAJES {
        let sender = format!("{}@s", i % 500);
        conversations::observar(
            &db,
            conversations::ObserveRequest {
                sender: sender.clone(),
                gjid: "1@g".into(),
                text: "hola que tal".into(),
            },
        );
        let req = user_memory::UpdateRequest {
            text: "hola que tal".into(),
            intent: "neutral".into(),
            is_cmd: false,
        };
        user_memory::actualizar(&db, &sender, &req).unwrap();
        if (i + 1) % 64 == 0 {
            db.vaciar_pendientes();
        }
    }
    db.vaciar_pendientes();
    let despues = t.elapsed().as_secs_f64() * 1e6 / MENSAJES as f64;

    println!("  antes   (dos transacciones por mensaje)   {antes:>7.1} µs por mensaje");
    println!("  después (cola, vaciado cada 64)          {despues:>7.1} µs por mensaje");
    println!("  {:.1}x menos\n", antes / despues);
}
