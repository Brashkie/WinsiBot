/// db.rs — SQLite message delivery tracker
///
/// Registra cada mensaje saliente del bot y su estado de entrega.
/// Permite detectar mensajes no entregados, calcular tasas de delivery
/// y diagnosticar problemas de visibilidad con cuentas normales y Business.
///
/// Estados de entrega (alineados con Baileys MessageStatus):
///   0  = enviado al servidor WhatsApp (1 palomita gris)
///   1  = entregado al dispositivo     (2 palomitas grises)
///   2  = leído / visto               (2 palomitas azules)
///   3  = reproducido (audio/video)
///  -1  = fallido / rechazado

use std::sync::{Arc, Mutex};

use chrono::Utc;
use rusqlite::{params, Connection};

pub type Db = Arc<Mutex<Connection>>;

// ─── Init ─────────────────────────────────────────────────────────────────────

pub fn open(path: &str) -> Result<Db, rusqlite::Error> {
    let conn = Connection::open(path)?;

    conn.execute_batch(
        "PRAGMA journal_mode = WAL;
         PRAGMA synchronous  = NORMAL;
         PRAGMA cache_size   = -8000;
         PRAGMA foreign_keys = ON;

         CREATE TABLE IF NOT EXISTS outbox (
             id          TEXT    PRIMARY KEY,
             jid         TEXT    NOT NULL,
             msg_type    TEXT    NOT NULL DEFAULT 'text',
             status      INTEGER NOT NULL DEFAULT 0,
             sent_at     INTEGER NOT NULL,
             updated_at  INTEGER,
             is_group    INTEGER NOT NULL DEFAULT 0,
             retry_count INTEGER NOT NULL DEFAULT 0
         );
         CREATE INDEX IF NOT EXISTS idx_outbox_status_sent ON outbox (status, sent_at);
         CREATE INDEX IF NOT EXISTS idx_outbox_jid         ON outbox (jid);
        ",
    )?;

    tracing::info!(path, "SQLite abierta (WAL)");
    Ok(Arc::new(Mutex::new(conn)))
}

// ─── Structs de datos ─────────────────────────────────────────────────────────

#[derive(Debug, serde::Deserialize)]
pub struct TrackItem {
    pub id:       String,
    pub jid:      String,
    #[serde(default = "default_type")]
    pub msg_type: String,
    pub ts:       i64,
}

fn default_type() -> String { "text".into() }

#[derive(Debug, serde::Deserialize)]
pub struct AckItem {
    pub id:     String,
    pub status: i32,
}

#[derive(Debug, serde::Serialize)]
pub struct PendingMsg {
    pub id:          String,
    pub jid:         String,
    pub msg_type:    String,
    pub sent_at:     i64,
    pub elapsed_sec: i64,
    pub is_group:    bool,
}

#[derive(Debug, serde::Serialize)]
pub struct DeliveryStats {
    pub total:        i64,
    pub sent:         i64,   // status=0: en tránsito
    pub delivered:    i64,   // status=1
    pub read:         i64,   // status>=2
    pub failed:       i64,   // status=-1
    pub delivery_pct: f64,   // (delivered+read)/total*100
    pub read_pct:     f64,   // read/total*100
}

// ─── Operaciones ─────────────────────────────────────────────────────────────

/// Registrar mensajes salientes en lote.
pub fn track(db: &Db, items: &[TrackItem]) -> Result<usize, rusqlite::Error> {
    let conn = db.lock().unwrap();
    let mut n = 0usize;
    for m in items {
        let is_group = m.jid.ends_with("@g.us") as i32;
        n += conn.execute(
            "INSERT OR IGNORE INTO outbox (id, jid, msg_type, status, sent_at, is_group)
             VALUES (?1, ?2, ?3, 0, ?4, ?5)",
            params![m.id, m.jid, m.msg_type, m.ts, is_group],
        )?;
    }
    tracing::debug!(n, "mensajes registrados en outbox");
    Ok(n)
}

/// Actualizar estado de entrega en lote.
/// Solo avanza (no permite bajar de 'leído' a 'entregado').
pub fn ack(db: &Db, items: &[AckItem]) -> Result<usize, rusqlite::Error> {
    let conn  = db.lock().unwrap();
    let now   = Utc::now().timestamp();
    let mut n = 0usize;
    for a in items {
        n += conn.execute(
            "UPDATE outbox SET status = ?1, updated_at = ?2
             WHERE id = ?3 AND status < ?1",
            params![a.status, now, a.id],
        )?;
    }
    tracing::debug!(n, "mensajes actualizados en outbox");
    Ok(n)
}

/// Mensajes que llevan más de `min_age_sec` sin confirmar entrega (status=0).
pub fn get_pending(db: &Db, min_age_sec: i64, limit: i64) -> Result<Vec<PendingMsg>, rusqlite::Error> {
    let conn   = db.lock().unwrap();
    let now    = Utc::now().timestamp();
    let cutoff = now - min_age_sec;

    let mut stmt = conn.prepare(
        "SELECT id, jid, msg_type, sent_at, ?1 - sent_at, is_group
         FROM outbox
         WHERE status = 0 AND sent_at < ?2
         ORDER BY sent_at ASC
         LIMIT ?3",
    )?;

    let rows: Vec<_> = stmt.query_map(params![now, cutoff, limit], |row| {
        Ok(PendingMsg {
            id:          row.get(0)?,
            jid:         row.get(1)?,
            msg_type:    row.get(2)?,
            sent_at:     row.get(3)?,
            elapsed_sec: row.get(4)?,
            is_group:    row.get::<_, i32>(5)? != 0,
        })
    })?
    .collect();
    rows.into_iter().collect()
}

/// Estadísticas de delivery para las últimas `hours` horas.
pub fn get_stats(db: &Db, hours: i64) -> Result<DeliveryStats, rusqlite::Error> {
    let conn  = db.lock().unwrap();
    let since = Utc::now().timestamp() - hours * 3600;

    conn.query_row(
        "SELECT
             COUNT(*)                                         AS total,
             SUM(CASE WHEN status = 0  THEN 1 ELSE 0 END)   AS sent,
             SUM(CASE WHEN status = 1  THEN 1 ELSE 0 END)   AS delivered,
             SUM(CASE WHEN status >= 2 THEN 1 ELSE 0 END)   AS read_,
             SUM(CASE WHEN status = -1 THEN 1 ELSE 0 END)   AS failed
         FROM outbox WHERE sent_at > ?1",
        params![since],
        |row| {
            let total:     i64 = row.get(0)?;
            let sent:      i64 = row.get(1)?;
            let delivered: i64 = row.get(2)?;
            let read:      i64 = row.get(3)?;
            let failed:    i64 = row.get(4)?;

            let del_pct  = if total > 0 { (delivered + read) as f64 / total as f64 * 100.0 } else { 100.0 };
            let read_pct = if total > 0 { read as f64 / total as f64 * 100.0 } else { 0.0 };

            Ok(DeliveryStats { total, sent, delivered, read, failed, delivery_pct: del_pct, read_pct })
        },
    )
}

/// Eliminar registros más viejos que `days` días.
pub fn cleanup(db: &Db, days: i64) -> Result<usize, rusqlite::Error> {
    let conn   = db.lock().unwrap();
    let cutoff = Utc::now().timestamp() - days * 86_400;
    let n = conn.execute("DELETE FROM outbox WHERE sent_at < ?1", params![cutoff])?;
    tracing::info!(n, days, "outbox: registros eliminados");
    Ok(n)
}
