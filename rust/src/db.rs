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
use serde::Deserialize;

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
             retry_count INTEGER NOT NULL DEFAULT 0,
             payload     TEXT
         );
         CREATE INDEX IF NOT EXISTS idx_outbox_status_sent ON outbox (status, sent_at);
         CREATE INDEX IF NOT EXISTS idx_outbox_jid         ON outbox (jid);

         CREATE TABLE IF NOT EXISTS audit_log (
             id       INTEGER PRIMARY KEY AUTOINCREMENT,
             ts       INTEGER NOT NULL,
             category TEXT    NOT NULL,
             event    TEXT    NOT NULL,
             detail   TEXT
         );
         CREATE INDEX IF NOT EXISTS idx_audit_ts       ON audit_log (ts);
         CREATE INDEX IF NOT EXISTS idx_audit_category ON audit_log (category);
        ",
    )?;

    // Migración para bases creadas antes de que outbox tuviera payload: el
    // CREATE TABLE de arriba lleva IF NOT EXISTS, así que a una tabla ya
    // existente no le añade la columna. ALTER falla con "duplicate column
    // name" si ya está, que es exactamente el caso normal — se ignora.
    if let Err(e) = conn.execute("ALTER TABLE outbox ADD COLUMN payload TEXT", []) {
        let msg = e.to_string();
        if !msg.contains("duplicate column name") {
            tracing::warn!(error = %msg, "no se pudo añadir outbox.payload");
        }
    }

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

#[derive(Debug, Deserialize)]
pub struct EnqueueItem {
    pub id:       String,
    pub jid:      String,
    #[serde(default = "default_type")]
    pub msg_type: String,
    /// Lo necesario para reconstruir el envío (JSON serializado por el llamador).
    pub payload:  String,
}

#[derive(Debug, serde::Serialize)]
pub struct QueuedMsg {
    pub id:          String,
    pub jid:         String,
    pub msg_type:    String,
    pub payload:     String,
    pub retry_count: i64,
    pub queued_at:   i64,
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
/// Un solo `transaction()` para todo el lote (hasta MAX_BATCH=1000 items por
/// request) en vez de un execute() por item — cada execute() de rusqlite en
/// modo autocommit es su propio commit implícito; con WAL+synchronous=NORMAL
/// no hace fsync por commit, pero sigue siendo cientos de commits separados
/// en vez de uno solo. Con ráfagas reales (varios grupos activos mandando
/// mensajes casi al mismo tiempo) esto es la diferencia entre una escritura
/// de disco por lote y una por mensaje.
pub fn track(db: &Db, items: &[TrackItem]) -> Result<usize, rusqlite::Error> {
    let mut conn = db.lock().unwrap();
    let tx = conn.transaction()?;
    let mut n = 0usize;
    for m in items {
        let is_group = m.jid.ends_with("@g.us") as i32;
        n += tx.execute(
            "INSERT OR IGNORE INTO outbox (id, jid, msg_type, status, sent_at, is_group)
             VALUES (?1, ?2, ?3, 0, ?4, ?5)",
            params![m.id, m.jid, m.msg_type, m.ts, is_group],
        )?;
    }
    tx.commit()?;
    tracing::debug!(n, "mensajes registrados en outbox");
    Ok(n)
}

/// Estado "encolado, todavía no enviado". El resto de la escala la define ack():
/// -1 fallido, 0 enviado, 1 entregado, 2 leído, 3 reproducido. Un mensaje en
/// QUEUED nunca llegó a salir, así que es el único que tiene sentido reenviar.
pub const STATUS_QUEUED: i64 = -2;

/// Encolar ANTES de enviar, con el contenido necesario para reenviarlo.
///
/// Esto es lo que convierte la tabla en un outbox de verdad: track() registra
/// después de enviar y sin payload, así que sirve para saber si un mensaje se
/// entregó, pero no para recuperarlo si el proceso murió antes de mandarlo.
/// El caso real es "se descontó el dinero y el mensaje nunca salió".
pub fn enqueue(db: &Db, items: &[EnqueueItem]) -> Result<usize, rusqlite::Error> {
    let mut conn = db.lock().unwrap();
    let tx = conn.transaction()?;
    let now = Utc::now().timestamp();
    let mut n = 0usize;
    for m in items {
        let is_group = m.jid.ends_with("@g.us") as i32;
        n += tx.execute(
            "INSERT OR IGNORE INTO outbox (id, jid, msg_type, status, sent_at, is_group, payload)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![m.id, m.jid, m.msg_type, STATUS_QUEUED, now, is_group, m.payload],
        )?;
    }
    tx.commit()?;
    tracing::debug!(n, "mensajes encolados en outbox");
    Ok(n)
}

/// Mensajes que quedaron encolados sin llegar a enviarse — para reenviar al
/// arrancar. `max_retries` descarta los que ya se reintentaron demasiado: sin
/// ese tope, un mensaje que siempre falla se reintentaría en cada arranque
/// para siempre (es el caso que resuelve una dead-letter queue).
pub fn unsent(db: &Db, limit: i64, max_retries: i64) -> Result<Vec<QueuedMsg>, rusqlite::Error> {
    let conn = db.lock().unwrap();
    let mut stmt = conn.prepare(
        "SELECT id, jid, msg_type, payload, retry_count, sent_at
           FROM outbox
          WHERE status = ?1 AND retry_count < ?2 AND payload IS NOT NULL
          ORDER BY sent_at ASC
          LIMIT ?3",
    )?;
    let rows = stmt.query_map(params![STATUS_QUEUED, max_retries, limit], |r| {
        Ok(QueuedMsg {
            id:          r.get(0)?,
            jid:         r.get(1)?,
            msg_type:    r.get(2)?,
            payload:     r.get(3)?,
            retry_count: r.get(4)?,
            queued_at:   r.get(5)?,
        })
    })?;
    rows.collect()
}

/// Marcar como realmente enviado (QUEUED -> 0) y soltar el payload, que ya no
/// hace falta: guardarlo indefinidamente haría crecer la base sin motivo.
pub fn mark_sent(db: &Db, ids: &[String]) -> Result<usize, rusqlite::Error> {
    let mut conn = db.lock().unwrap();
    let tx  = conn.transaction()?;
    let now = Utc::now().timestamp();
    let mut n = 0usize;
    for id in ids {
        n += tx.execute(
            "UPDATE outbox SET status = 0, updated_at = ?1, payload = NULL
              WHERE id = ?2 AND status = ?3",
            params![now, id, STATUS_QUEUED],
        )?;
    }
    tx.commit()?;
    Ok(n)
}

/// Suma uno al contador de reintentos — lo llama el replay antes de reintentar,
/// para que un mensaje que siempre falla acabe cayendo del listado de unsent().
pub fn bump_retry(db: &Db, ids: &[String]) -> Result<usize, rusqlite::Error> {
    let mut conn = db.lock().unwrap();
    let tx = conn.transaction()?;
    let mut n = 0usize;
    for id in ids {
        n += tx.execute(
            "UPDATE outbox SET retry_count = retry_count + 1 WHERE id = ?1",
            params![id],
        )?;
    }
    tx.commit()?;
    Ok(n)
}

/// Actualizar estado de entrega en lote.
/// Solo avanza (no permite bajar de 'leído' a 'entregado').
/// Statuses válidos: -1 (fallido), 0 (enviado), 1 (entregado), 2 (leído), 3 (reproducido).
/// Misma transacción única que track() — ver comentario ahí.
pub fn ack(db: &Db, items: &[AckItem]) -> Result<usize, rusqlite::Error> {
    let mut conn = db.lock().unwrap();
    let tx    = conn.transaction()?;
    let now   = Utc::now().timestamp();
    let mut n = 0usize;
    for a in items {
        if !matches!(a.status, -1..=3) {
            tracing::warn!(id = %a.id, status = a.status, "ack status fuera de rango, ignorado");
            continue;
        }
        n += tx.execute(
            "UPDATE outbox SET status = ?1, updated_at = ?2
             WHERE id = ?3 AND status < ?1",
            params![a.status, now, a.id],
        )?;
    }
    tx.commit()?;
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

// ─── Audit log — rastro forense de eventos del sistema ────────────────────────
// category: "subbot" | "watchdog" | "session" — event: texto libre corto.
// detail: JSON serializado opcional con contexto adicional.

pub fn audit_log(
    db:       &Db,
    category: &str,
    event:    &str,
    detail:   Option<&str>,
) -> Result<(), rusqlite::Error> {
    let conn = db.lock().unwrap();
    conn.execute(
        "INSERT INTO audit_log (ts, category, event, detail) VALUES (?1, ?2, ?3, ?4)",
        params![Utc::now().timestamp(), category, event, detail],
    )?;
    Ok(())
}

