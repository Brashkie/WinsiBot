"""
WinsiBot — Database
SQLite centralizado para todos los datos del bot
"""

import sqlite3
import threading
import json
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

def upsert_user(sender: str, push_name: str = '', **kwargs) -> dict:
    with transaction() as conn:
        conn.execute(
            'INSERT OR IGNORE INTO users (sender, push_name) VALUES (?, ?)',
            (sender, push_name)
        )
        if kwargs:
            kwargs['updated_at'] = datetime.utcnow().isoformat()
            cols = ', '.join(f'{k} = ?' for k in kwargs)
            vals = list(kwargs.values()) + [sender]
            conn.execute(f'UPDATE users SET {cols} WHERE sender = ?', vals)
    return get_user(sender)

# ─── Group config ─────────────────────────────────────────────────────────────
def get_group_config(jid: str) -> dict:
    conn = get_conn()
    row  = conn.execute('SELECT * FROM group_config WHERE jid = ?', (jid,)).fetchone()
    if row:
        return dict(row)
    conn.execute('INSERT OR IGNORE INTO group_config (jid) VALUES (?)', (jid,))
    conn.commit()
    return dict(conn.execute('SELECT * FROM group_config WHERE jid = ?', (jid,)).fetchone())

def update_group_config(jid: str, **kwargs) -> None:
    if not kwargs:
        return
    kwargs['updated_at'] = datetime.utcnow().isoformat()
    cols = ', '.join(f'{k} = ?' for k in kwargs)
    vals = list(kwargs.values()) + [jid]
    with transaction() as conn:
        conn.execute(f'INSERT OR IGNORE INTO group_config (jid) VALUES (?)', (jid,))
        conn.execute(f'UPDATE group_config SET {cols} WHERE jid = ?', vals)

# ─── Inventory ────────────────────────────────────────────────────────────────
def get_inventory(owner_jid: str) -> list:
    conn = get_conn()
    rows = conn.execute(
        'SELECT * FROM inventory WHERE owner_jid = ? ORDER BY obtained_at DESC',
        (owner_jid,)
    ).fetchall()
    result = []
    for row in rows:
        d = dict(row)
        try:
            d['char_data'] = json.loads(d['char_data'])
        except Exception:
            pass
        result.append(d)
    return result

def add_to_inventory(owner_jid: str, char: dict) -> bool:
    try:
        with transaction() as conn:
            conn.execute(
                'INSERT OR IGNORE INTO inventory (owner_jid, char_name, char_data) VALUES (?, ?, ?)',
                (owner_jid, char.get('name', ''), json.dumps(char))
            )
        return True
    except Exception:
        return False

def remove_from_inventory(owner_jid: str, char_name: str) -> dict | None:
    conn = get_conn()
    row  = conn.execute(
        'SELECT * FROM inventory WHERE owner_jid = ? AND char_name = ? COLLATE NOCASE',
        (owner_jid, char_name)
    ).fetchone()
    if not row:
        return None
    with transaction() as conn2:
        conn2.execute('DELETE FROM inventory WHERE id = ?', (row['id'],))
    d = dict(row)
    try:
        d['char_data'] = json.loads(d['char_data'])
    except Exception:
        pass
    return d

# ─── Health logs ──────────────────────────────────────────────────────────────
def save_health_log(timestamp: str, status: str, score: float,
                    checks: list, alerts: list) -> None:
    with transaction() as conn:
        conn.execute(
            'INSERT INTO health_logs (timestamp, status, score, checks, alerts) VALUES (?, ?, ?, ?, ?)',
            (timestamp, status, score, json.dumps(checks), json.dumps(alerts))
        )
        # mantener solo últimos 500
        conn.execute(
            'DELETE FROM health_logs WHERE id NOT IN (SELECT id FROM health_logs ORDER BY id DESC LIMIT 500)'
        )

def get_health_logs(limit: int = 50) -> list:
    conn = get_conn()
    rows = conn.execute(
        'SELECT * FROM health_logs ORDER BY id DESC LIMIT ?', (limit,)
    ).fetchall()
    result = []
    for row in rows:
        d = dict(row)
        d['checks'] = json.loads(d['checks'])
        d['alerts'] = json.loads(d['alerts'])
        result.append(d)
    return result

# ─── Break logs ───────────────────────────────────────────────────────────────
def upsert_break(break_id: str, **kwargs) -> None:
    conn = get_conn()
    existing = conn.execute(
        'SELECT id FROM break_logs WHERE break_id = ?', (break_id,)
    ).fetchone()
    with transaction() as conn2:
        if existing:
            kwargs['last_seen'] = datetime.utcnow().isoformat()
            cols = ', '.join(f'{k} = ?' for k in kwargs)
            vals = list(kwargs.values()) + [break_id]
            conn2.execute(f'UPDATE break_logs SET {cols} WHERE break_id = ?', vals)
        else:
            kwargs['break_id'] = break_id
            cols = ', '.join(kwargs.keys())
            vals = list(kwargs.values())
            placeholders = ', '.join('?' * len(vals))
            conn2.execute(f'INSERT INTO break_logs ({cols}) VALUES ({placeholders})', vals)

def get_active_breaks() -> list:
    conn = get_conn()
    rows = conn.execute(
        'SELECT * FROM break_logs WHERE resolved = 0 ORDER BY severity, frequency DESC'
    ).fetchall()
    return [dict(r) for r in rows]

def resolve_break(break_id: str) -> bool:
    with transaction() as conn:
        conn.execute(
            'UPDATE break_logs SET resolved = 1 WHERE break_id = ?', (break_id,)
        )
    return True

# ─── Alert logs ───────────────────────────────────────────────────────────────
def upsert_alert(alert_id: str, **kwargs) -> dict | None:
    conn = get_conn()
    existing = conn.execute(
        'SELECT * FROM alert_logs WHERE alert_id = ?', (alert_id,)
    ).fetchone()
    with transaction() as conn2:
        if existing:
            kwargs['last_seen'] = datetime.utcnow().isoformat()
            cols = ', '.join(f'{k} = ?' for k in kwargs)
            vals = list(kwargs.values()) + [alert_id]
            conn2.execute(f'UPDATE alert_logs SET {cols} WHERE alert_id = ?', vals)
            return dict(existing)
        else:
            kwargs['alert_id'] = alert_id
            cols = ', '.join(kwargs.keys())
            vals = list(kwargs.values())
            placeholders = ', '.join('?' * len(vals))
            conn2.execute(
                f'INSERT INTO alert_logs ({cols}) VALUES ({placeholders})', vals
            )
            return None  # nueva alerta

def get_active_alerts() -> list:
    conn = get_conn()
    rows = conn.execute(
        'SELECT * FROM alert_logs WHERE resolved = 0 ORDER BY level, count DESC'
    ).fetchall()
    return [dict(r) for r in rows]

def resolve_alert_db(alert_id: str) -> None:
    with transaction() as conn:
        conn.execute(
            'UPDATE alert_logs SET resolved = 1 WHERE alert_id = ?', (alert_id,)
        )

# ─── Session events ───────────────────────────────────────────────────────────
def log_event_db(event: str, detail: str = '') -> None:
    with transaction() as conn:
        conn.execute(
            'INSERT INTO session_events (event, detail) VALUES (?, ?)',
            (event, detail)
        )
        # mantener últimos 1000
        conn.execute(
            'DELETE FROM session_events WHERE id NOT IN (SELECT id FROM session_events ORDER BY id DESC LIMIT 1000)'
        )

# ─── Pending messages ─────────────────────────────────────────────────────────
def save_pending(jid: str, sender: str, text: str, msg_data: dict) -> int:
    with transaction() as conn:
        cursor = conn.execute(
            'INSERT INTO pending_messages (jid, sender, text, msg_data) VALUES (?, ?, ?, ?)',
            (jid, sender, text, json.dumps(msg_data))
        )
        return cursor.lastrowid

def get_pending(jid: str) -> list:
    conn = get_conn()
    rows = conn.execute(
        'SELECT * FROM pending_messages WHERE jid = ? AND processed = 0 ORDER BY id ASC',
        (jid,)
    ).fetchall()
    result = []
    for row in rows:
        d = dict(row)
        d['msg_data'] = json.loads(d['msg_data'])
        result.append(d)
    return result

def mark_processed(msg_id: int) -> None:
    with transaction() as conn:
        conn.execute(
            'UPDATE pending_messages SET processed = 1 WHERE id = ?', (msg_id,)
        )

# ─── Init ─────────────────────────────────────────────────────────────────────
init_db()