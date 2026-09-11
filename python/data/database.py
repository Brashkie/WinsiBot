"""
WinsiBot — Conexión SQLite para Python

Ya NO es "la base de datos central del bot": ese papel lo tienen el userData de
Node (persistido en data/users.aof) y las tablas de Rust (outbox, contadores,
audit). Acá quedaba un esquema de 9 tablas —users, group_config, inventory,
trades, health_logs, break_logs, alert_logs, session_events, pending_messages—
que NO usaba nadie: el estado real vive en los otros dos sitios, y
pending_messages pertenecía a un sistema ya eliminado. El archivo winsibot.db
pesaba 0 bytes, señal de que nunca llegó a escribirse nada.

Lo único que sigue vivo es la conexión: ai/personality.py la pide para crear y
mantener su propia tabla `personality_config`. Cuando personality migre a Rust,
este archivo se va con él.
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


def init_db() -> None:
    """Abre la conexión (y crea el archivo si no existe).

    Ya no crea tablas: cada módulo que necesite una la declara él mismo con
    CREATE TABLE IF NOT EXISTS, como hace ai/personality.py. Un esquema
    central de tablas que nadie usaba solo servía para dar la impresión de
    que ahí vivían datos del bot.
    """
    get_conn()
