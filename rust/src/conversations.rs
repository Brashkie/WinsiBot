/// conversations.rs
/// DuckDB-backed AI conversation storage.
/// Routes: POST /ai/learn, GET /ai/context/{sender}, POST /ai/export

use axum::{
    extract::{Path, Query, State},
    response::Json,
};
use chrono::Utc;
use duckdb::{params, Connection};
use serde::{Deserialize, Serialize};

use crate::routes::AppState;

// ── Structs ───────────────────────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct LearnRequest {
    pub sender: String,
    pub gjid:   String,
    pub text:   String,
    pub intent: String,
    pub reply:  String,
    pub mode:   String,
}

#[derive(Serialize)]
struct HistoryEntry {
    text:   String,
    intent: String,
    reply:  String,
    ts:     i64,
}

#[derive(Serialize)]
struct UserStyle {
    total_msgs:    i64,
    avg_len:       f64,
    emoji_freq:    f64,
    question_freq: f64,
    common_words:  Vec<String>,
}

#[derive(Deserialize)]
pub struct ContextParams {
    pub limit: Option<i64>,
}

// ── Init ──────────────────────────────────────────────────────────────────────

pub fn init(path: &str) {
    if let Some(parent) = std::path::Path::new(path).parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    match Connection::open(path) {
        Ok(conn) => {
            let r = conn.execute_batch("
                CREATE TABLE IF NOT EXISTS conversations (
                    id        VARCHAR DEFAULT gen_random_uuid(),
                    sender    VARCHAR NOT NULL,
                    gjid      VARCHAR NOT NULL DEFAULT '',
                    text      VARCHAR NOT NULL,
                    intent    VARCHAR NOT NULL DEFAULT 'neutral',
                    reply     VARCHAR NOT NULL DEFAULT '',
                    mode      VARCHAR NOT NULL DEFAULT 'amable',
                    ts        BIGINT  NOT NULL,
                    len       INTEGER NOT NULL DEFAULT 0,
                    has_emoji BOOLEAN NOT NULL DEFAULT false
                );
                CREATE TABLE IF NOT EXISTS user_style (
                    sender        VARCHAR PRIMARY KEY,
                    total_msgs    BIGINT  NOT NULL DEFAULT 0,
                    avg_len       DOUBLE  NOT NULL DEFAULT 0.0,
                    emoji_freq    DOUBLE  NOT NULL DEFAULT 0.0,
                    question_freq DOUBLE  NOT NULL DEFAULT 0.0,
                    common_words  VARCHAR NOT NULL DEFAULT '[]',
                    updated_at    BIGINT  NOT NULL DEFAULT 0
                );
            ");
            if let Err(e) = r {
                tracing::warn!("DuckDB schema init error: {}", e);
            }
        }
        Err(e) => tracing::warn!("DuckDB open error: {}", e),
    }
}

// ── POST /ai/learn ────────────────────────────────────────────────────────────

pub async fn ai_learn(
    State(state): State<AppState>,
    Json(req):    Json<LearnRequest>,
) -> Json<serde_json::Value> {
    let path = state.conv_db_path.clone();

    let res = tokio::task::spawn_blocking(move || -> Result<(), String> {
        let conn = Connection::open(&path).map_err(|e| e.to_string())?;

        let has_emoji = req.text.chars().any(|c| (c as u32) > 0x2500);
        let has_q     = req.text.contains('?');
        let len       = req.text.len() as i32;
        let ts        = Utc::now().timestamp_millis();

        conn.execute(
            "INSERT INTO conversations
             (sender, gjid, text, intent, reply, mode, ts, len, has_emoji)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            params![req.sender, req.gjid, req.text, req.intent, req.reply, req.mode, ts, len, has_emoji],
        ).map_err(|e| e.to_string())?;

        // Recompute aggregates
        let total: i64 = conn
            .query_row("SELECT COUNT(*) FROM conversations WHERE sender = ?",
                params![req.sender], |r| r.get(0))
            .unwrap_or(1);

        let avg_len: f64 = conn
            .query_row("SELECT AVG(len) FROM conversations WHERE sender = ?",
                params![req.sender], |r| r.get(0))
            .unwrap_or(f64::from(len));

        let emoji_freq: f64 = conn
            .query_row(
                "SELECT AVG(CAST(has_emoji AS INTEGER)) FROM conversations WHERE sender = ?",
                params![req.sender], |r| r.get(0))
            .unwrap_or(if has_emoji { 1.0 } else { 0.0 });

        let question_freq: f64 = conn
            .query_row(
                "SELECT AVG(CASE WHEN text LIKE '%?%' THEN 1.0 ELSE 0.0 END) \
                 FROM conversations WHERE sender = ?",
                params![req.sender], |r| r.get(0))
            .unwrap_or(if has_q { 1.0 } else { 0.0 });

        let common_words = if total % 20 == 0 {
            compute_common_words(&conn, &req.sender)
        } else {
            conn.query_row(
                "SELECT COALESCE(common_words, '[]') FROM user_style WHERE sender = ?",
                params![req.sender], |r| r.get::<_, String>(0))
            .unwrap_or_else(|_| "[]".to_string())
        };

        conn.execute(
            "INSERT INTO user_style
             (sender, total_msgs, avg_len, emoji_freq, question_freq, common_words, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT (sender) DO UPDATE SET
               total_msgs    = excluded.total_msgs,
               avg_len       = excluded.avg_len,
               emoji_freq    = excluded.emoji_freq,
               question_freq = excluded.question_freq,
               common_words  = excluded.common_words,
               updated_at    = excluded.updated_at",
            params![req.sender, total, avg_len, emoji_freq, question_freq, common_words, ts],
        ).map_err(|e| e.to_string())?;

        Ok(())
    }).await;

    match res {
        Ok(Ok(()))   => Json(serde_json::json!({ "ok": true })),
        Ok(Err(e))   => Json(serde_json::json!({ "ok": false, "error": e })),
        Err(e)       => Json(serde_json::json!({ "ok": false, "error": e.to_string() })),
    }
}

fn compute_common_words(conn: &Connection, sender: &str) -> String {
    let texts: Vec<String> = conn
        .prepare("SELECT text FROM conversations WHERE sender = ? ORDER BY ts DESC LIMIT 200")
        .and_then(|mut s| {
            let rows = s.query_map(params![sender], |r| r.get::<_, String>(0))?
                .filter_map(|r| r.ok())
                .collect();
            Ok(rows)
        })
        .unwrap_or_default();

    let stop: std::collections::HashSet<&str> = [
        "de","la","el","en","y","a","que","es","se","no","un","una",
        "los","las","por","con","para","del","al","lo","como","más",
        "me","te","le","su","mi","tu","ya","si","pero","hay",
    ].iter().copied().collect();

    let mut freq: std::collections::HashMap<String, u32> = std::collections::HashMap::new();
    for text in &texts {
        for raw in text.split_whitespace() {
            let w: String = raw.to_lowercase()
                .chars()
                .filter(|c| c.is_alphabetic())
                .collect();
            if w.len() >= 3 && !stop.contains(w.as_str()) {
                *freq.entry(w).or_insert(0) += 1;
            }
        }
    }

    let mut words: Vec<(String, u32)> = freq.into_iter().collect();
    words.sort_by(|a, b| b.1.cmp(&a.1));
    let top: Vec<String> = words.into_iter().take(20).map(|(w, _)| w).collect();

    serde_json::to_string(&top).unwrap_or_else(|_| "[]".to_string())
}

// ── GET /ai/context/{sender} ──────────────────────────────────────────────────

pub async fn ai_context(
    State(state):  State<AppState>,
    Path(sender):  Path<String>,
    Query(params): Query<ContextParams>,
) -> Json<serde_json::Value> {
    let limit = params.limit.unwrap_or(8).clamp(1, 50);
    let path  = state.conv_db_path.clone();

    let res = tokio::task::spawn_blocking(move || -> Result<_, String> {
        let conn = Connection::open(&path).map_err(|e| e.to_string())?;

        let mut stmt = conn
            .prepare("SELECT text, intent, reply, ts \
                      FROM conversations WHERE sender = ? \
                      ORDER BY ts DESC LIMIT ?")
            .map_err(|e| e.to_string())?;

        let mut history: Vec<HistoryEntry> = stmt
            .query_map(params![sender, limit], |row| {
                Ok(HistoryEntry {
                    text:   row.get(0)?,
                    intent: row.get(1)?,
                    reply:  row.get(2)?,
                    ts:     row.get(3)?,
                })
            })
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect();

        history.reverse(); // oldest → newest

        let style = conn
            .query_row(
                "SELECT total_msgs, avg_len, emoji_freq, question_freq, common_words \
                 FROM user_style WHERE sender = ?",
                params![sender],
                |row| {
                    let words_json: String = row.get(4)?;
                    let common_words: Vec<String> =
                        serde_json::from_str(&words_json).unwrap_or_default();
                    Ok(UserStyle {
                        total_msgs:    row.get(0)?,
                        avg_len:       row.get(1)?,
                        emoji_freq:    row.get(2)?,
                        question_freq: row.get(3)?,
                        common_words,
                    })
                },
            )
            .ok();

        Ok((history, style))
    }).await;

    match res {
        Ok(Ok((history, style))) => Json(serde_json::json!({
            "ok":      true,
            "history": history,
            "style":   style,
        })),
        _ => Json(serde_json::json!({ "ok": true, "history": [], "style": null })),
    }
}

// ── POST /ai/export ───────────────────────────────────────────────────────────

pub async fn ai_export(
    State(state): State<AppState>,
) -> Json<serde_json::Value> {
    let path = state.conv_db_path.clone();

    let res = tokio::task::spawn_blocking(move || -> Result<String, String> {
        let conn = Connection::open(&path).map_err(|e| e.to_string())?;
        let out  = path.replace(".duckdb", "_conversations.parquet")
                       .replace('\\', "/");
        conn.execute_batch(&format!(
            "COPY conversations TO '{out}' (FORMAT PARQUET, COMPRESSION ZSTD)"
        )).map_err(|e| e.to_string())?;
        Ok(out)
    }).await;

    match res {
        Ok(Ok(p))  => Json(serde_json::json!({ "ok": true,  "path": p })),
        Ok(Err(e)) => Json(serde_json::json!({ "ok": false, "error": e })),
        Err(e)     => Json(serde_json::json!({ "ok": false, "error": e.to_string() })),
    }
}
