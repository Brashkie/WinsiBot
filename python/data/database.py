"""
WinsiBot — Database
SQLite centralizado para todos los datos del bot
"""

import sqlite3
import threading
from pathlib import Path
from datetime import datetime
from contextlib import contextmanager

DB_DIR  = Path(__file__).parent.parent.parent / 'data' / 'db'
DB_PATH = DB_DIR / 'winsibot.db'

DB_DIR.mkdir(parents=True, exist_ok=True)

# ─── Connection pool thread-safe ──────────────────────────────────────────────
_local = threading.local()

def get_conn() -> sqlite3.Connection:
    if not hasattr(_local, 'conn') or _local.conn is None:
        _local.conn = sqlite3.connect(
            str(DB_PATH),
            check_same_thread = False,
            timeout           = 10,
        )
        _local.conn.row_factory = sqlite3.Row
        _local.conn.execute('PRAGMA journal_mode=WAL')
        _local.conn.execute('PRAGMA synchronous=NORMAL')
        _local.conn.execute('PRAGMA cache_size=-64000')   # 64MB cache
        _local.conn.execute('PRAGMA temp_store=MEMORY')
        _local.conn.execute('PRAGMA mmap_size=268435456') # 256MB mmap
    return _local.conn

@contextmanager
def transaction():
    conn = get_conn()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise

# ─── Schema ───────────────────────────────────────────────────────────────────
SCHEMA = """
-- ── Usuarios ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
    sender      TEXT PRIMARY KEY,
    push_name   TEXT DEFAULT '',
    exp         INTEGER DEFAULT 0,
    level       INTEGER DEFAULT 1,
    money       INTEGER DEFAULT 0,
    diamonds    INTEGER DEFAULT 0,
    premium     INTEGER DEFAULT 0,
    banned      INTEGER DEFAULT 0,
    ban_reason  TEXT DEFAULT '',
    registered  INTEGER DEFAULT 0,
    reg_name    TEXT DEFAULT '',
    reg_age     INTEGER DEFAULT 0,
    reg_code    TEXT DEFAULT '',
    last_spam   INTEGER DEFAULT 0,
    created_at  TEXT DEFAULT (datetime('now')),
    updated_at  TEXT DEFAULT (datetime('now'))
);

-- ── Grupos config ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS group_config (
    jid         TEXT PRIMARY KEY,
    muted       INTEGER DEFAULT 0,
    antilink    INTEGER DEFAULT 0,
    antispam    INTEGER DEFAULT 0,
    modoadmin   INTEGER DEFAULT 0,
    welcome     INTEGER DEFAULT 0,
    goodbye     INTEGER DEFAULT 0,
    updated_at  TEXT DEFAULT (datetime('now'))
);

-- ── Inventario gacha ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS inventory (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_jid   TEXT NOT NULL,
    char_name   TEXT NOT NULL,
    char_data   TEXT NOT NULL,   -- JSON del personaje
    obtained_at TEXT DEFAULT (datetime('now')),
    UNIQUE(owner_jid, char_name)
);

-- ── Trade requests ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS trades (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    from_jid    TEXT NOT NULL,
    to_jid      TEXT NOT NULL,
    char_name   TEXT NOT NULL,
    status      TEXT DEFAULT 'pending',  -- pending|accepted|rejected|expired
    expires_at  TEXT NOT NULL,
    created_at  TEXT DEFAULT (datetime('now'))
);

-- ── Health logs ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS health_logs (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp   TEXT NOT NULL,
    status      TEXT NOT NULL,
    score       REAL NOT NULL,
    checks      TEXT NOT NULL,   -- JSON
    alerts      TEXT NOT NULL,   -- JSON
    created_at  TEXT DEFAULT (datetime('now'))
);

-- ── Break logs ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS break_logs (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    break_id       TEXT NOT NULL,
    type           TEXT NOT NULL,
    severity       TEXT NOT NULL,
    message        TEXT NOT NULL,
    pattern        TEXT NOT NULL,
    suggested_fix  TEXT DEFAULT '',
    context        TEXT DEFAULT '',
    group_id       TEXT DEFAULT '',
    frequency      REAL DEFAULT 0,
    count          INTEGER DEFAULT 1,
    resolved       INTEGER DEFAULT 0,
    first_seen     TEXT NOT NULL,
    last_seen      TEXT NOT NULL,
    UNIQUE(break_id)
);

-- ── Alert logs ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS alert_logs (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    alert_id    TEXT NOT NULL,
    level       TEXT NOT NULL,
    source      TEXT NOT NULL,
    title       TEXT NOT NULL,
    message     TEXT NOT NULL,
    count       INTEGER DEFAULT 1,
    resolved    INTEGER DEFAULT 0,
    timestamp   TEXT NOT NULL,
    last_seen   TEXT NOT NULL,
    UNIQUE(alert_id)
);

-- ── Session events ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS session_events (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    event       TEXT NOT NULL,
    detail      TEXT DEFAULT '',
    created_at  TEXT DEFAULT (datetime('now'))
);

-- ── Pending messages ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pending_messages (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    jid         TEXT NOT NULL,
    sender      TEXT NOT NULL,
    text        TEXT DEFAULT '',
    msg_data    TEXT NOT NULL,   -- JSON del mensaje
    processed   INTEGER DEFAULT 0,
    created_at  TEXT DEFAULT (datetime('now'))
);

-- ── Índices ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_users_sender      ON users(sender);
CREATE INDEX IF NOT EXISTS idx_inventory_owner   ON inventory(owner_jid);
CREATE INDEX IF NOT EXISTS idx_health_ts         ON health_logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_break_id          ON break_logs(break_id);
CREATE INDEX IF NOT EXISTS idx_alert_id          ON alert_logs(alert_id);
CREATE INDEX IF NOT EXISTS idx_session_event     ON session_events(event);
CREATE INDEX IF NOT EXISTS idx_pending_jid       ON pending_messages(jid);
CREATE INDEX IF NOT EXISTS idx_pending_processed ON pending_messages(processed);
"""

def init_db() -> None:
    conn = get_conn()
    conn.executescript(SCHEMA)
    conn.commit()

# ─── Users ────────────────────────────────────────────────────────────────────
def get_user(sender: str) -> dict:
    conn = get_conn()
    row  = conn.execute('SELECT * FROM users WHERE sender = ?', (sender,)).fetchone()
    if row:
        return dict(row)
    # crear usuario nuevo
    conn.execute('INSERT OR IGNORE INTO users (sender) VALUES (?)', (sender,))
    conn.commit()
    return dict(conn.execute('SELECT * FROM users WHERE sender = ?', (sender,)).fetchone())

def update_user(sender: str, **kwargs) -> None:
    if not kwargs:
        return
    kwargs['updated_at'] = datetime.utcnow().isoformat()
    cols = ', '.join(f'{k} = ?' for k in kwargs)
    vals = list(kwargs.values()) + [sender]
    with transaction() as conn:
        conn.execute(f'UPDATE users SET {cols} WHERE sender = ?', vals)

# ─── Init ─────────────────────────────────────────────────────────────────────
init_db()