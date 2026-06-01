import atexit
import threading
import polars as pl
from pathlib import Path
from datetime import datetime
from typing import Optional
from .schemas import (
    MESSAGE_SCHEMA, USER_SCHEMA, GROUP_SCHEMA, COMMAND_STATS_SCHEMA,
    MessageRecord, UserRecord, GroupRecord,
)

DATA_DIR    = Path("data/parquet")
ARCHIVE_DIR = Path("data/parquet/archive")

# ─── Base ─────────────────────────────────────────────────────────────────────

def _path(name: str) -> Path:
    return DATA_DIR / f"{name}.parquet"

def _archive_path(name: str) -> Path:
    ARCHIVE_DIR.mkdir(parents=True, exist_ok=True)
    date = datetime.utcnow().strftime('%Y-%m-%d')
    return ARCHIVE_DIR / f"{name}_{date}.parquet"

def _ensure_dir():
    DATA_DIR.mkdir(parents=True, exist_ok=True)

def save_df(df: pl.DataFrame, name: str) -> None:
    _ensure_dir()
    df.write_parquet(_path(name), compression="snappy")

def load_df(name: str, schema: Optional[pl.Schema] = None) -> pl.DataFrame:
    path = _path(name)
    if not path.exists():
        return pl.DataFrame(schema=schema) if schema else pl.DataFrame()
    return pl.read_parquet(path)

def append_row(record: dict, name: str, schema: Optional[pl.Schema] = None) -> None:
    existing = load_df(name, schema)
    new_row  = pl.DataFrame([record], schema=schema)
    combined = pl.concat([existing, new_row], how="diagonal") if len(existing) > 0 else new_row
    save_df(combined, name)

def upsert_row(record: dict, key_col: str, name: str, schema: Optional[pl.Schema] = None) -> None:
    existing = load_df(name, schema)
    new_row  = pl.DataFrame([record], schema=schema)
    if len(existing) == 0:
        save_df(new_row, name)
        return
    filtered = existing.filter(pl.col(key_col) != record[key_col])
    combined = pl.concat([filtered, new_row], how="diagonal")
    save_df(combined, name)

# ─── Write buffer para mensajes (hot path) ────────────────────────────────────
_msg_buf:  list[dict]    = []
_msg_lock: threading.Lock = threading.Lock()
_MSG_FLUSH_EVERY = 5.0   # segundos
_MSG_FLUSH_MAX   = 50    # flush temprano si hay muchos mensajes

def _flush_messages() -> None:
    with _msg_lock:
        if not _msg_buf:
            return
        batch = _msg_buf.copy()
        _msg_buf.clear()
    try:
        existing = load_df("messages", MESSAGE_SCHEMA)
        new_rows  = pl.DataFrame(batch, schema=MESSAGE_SCHEMA)
        combined  = pl.concat([existing, new_rows], how="diagonal") if len(existing) > 0 else new_rows
        save_df(combined, "messages")
    except Exception:
        pass

def _flush_loop() -> None:
    import time
    while True:
        time.sleep(_MSG_FLUSH_EVERY)
        _flush_messages()

_flush_thread = threading.Thread(target=_flush_loop, daemon=True, name='MsgFlush')
_flush_thread.start()
atexit.register(_flush_messages)

# ─── Mensajes ─────────────────────────────────────────────────────────────────

def append_message(record: dict) -> None:
    record.setdefault("timestamp", datetime.utcnow().isoformat())
    record.setdefault("command",   "")
    record.setdefault("isGroup",   False)
    record.setdefault("isOwner",   False)
    with _msg_lock:
        _msg_buf.append(record)
        if len(_msg_buf) >= _MSG_FLUSH_MAX:
            threading.Thread(target=_flush_messages, daemon=True).start()

def load_messages(limit: int = 100) -> pl.DataFrame:
    df = load_df("messages", MESSAGE_SCHEMA)
    if df.is_empty():
        return df
    return df.sort("timestamp", descending=True).head(limit)

def get_messages_by_sender(sender: str) -> pl.DataFrame:
    df = load_df("messages", MESSAGE_SCHEMA)
    if df.is_empty():
        return df
    return df.filter(pl.col("sender") == sender)

# ─── Usuarios ─────────────────────────────────────────────────────────────────

def get_user(jid: str) -> Optional[dict]:
    df = load_df("users", USER_SCHEMA)
    if df.is_empty():
        return None
    result = df.filter(pl.col("jid") == jid)
    return result.to_dicts()[0] if len(result) > 0 else None

def upsert_user(record: dict) -> None:
    record["updatedAt"] = datetime.utcnow().isoformat()
    record.setdefault("createdAt", datetime.utcnow().isoformat())
    record.setdefault("banned",    False)
    record.setdefault("warns",     0)
    record.setdefault("exp",       0)
    record.setdefault("level",     1)
    record.setdefault("premium",   False)
    upsert_row(record, "jid", "users", USER_SCHEMA)

def get_or_create_user(jid: str, push_name: str = "", is_owner: bool = False) -> dict:
    user = get_user(jid)
    if user:
        return user
    new_user = UserRecord(jid=jid, pushName=push_name, isOwner=is_owner).to_dict()
    upsert_user(new_user)
    return new_user

def add_exp(jid: str, amount: int = 10) -> dict:
    user = get_or_create_user(jid)
    user["exp"] += amount
    user["level"] = max(1, user["exp"] // 100)
    upsert_user(user)
    return user

def add_warn(jid: str) -> int:
    user = get_or_create_user(jid)
    user["warns"] += 1
    upsert_user(user)
    return user["warns"]

def load_all_users() -> pl.DataFrame:
    return load_df("users", USER_SCHEMA)

# ─── Grupos ───────────────────────────────────────────────────────────────────

def get_group(jid: str) -> Optional[dict]:
    df = load_df("groups", GROUP_SCHEMA)
    if df.is_empty():
        return None
    result = df.filter(pl.col("jid") == jid)
    return result.to_dicts()[0] if len(result) > 0 else None

def upsert_group(record: dict) -> None:
    record["updatedAt"] = datetime.utcnow().isoformat()
    record.setdefault("createdAt", datetime.utcnow().isoformat())
    upsert_row(record, "jid", "groups", GROUP_SCHEMA)

def get_or_create_group(jid: str, name: str = "") -> dict:
    group = get_group(jid)
    if group:
        return group
    new_group = GroupRecord(jid=jid, name=name).to_dict()
    upsert_group(new_group)
    return new_group

def load_all_groups() -> pl.DataFrame:
    return load_df("groups", GROUP_SCHEMA)

# ─── Stats de comandos ────────────────────────────────────────────────────────

def log_command(command: str, sender: str, jid: str, success: bool = True) -> None:
    record = {
        "command":   command,
        "sender":    sender,
        "jid":       jid,
        "timestamp": datetime.utcnow().isoformat(),
        "success":   success,
    }
    append_row(record, "command_stats", COMMAND_STATS_SCHEMA)

def get_top_commands(limit: int = 10) -> list[dict]:
    df = load_df("command_stats", COMMAND_STATS_SCHEMA)
    if df.is_empty():
        return []
    return (
        df.group_by("command")
          .agg(pl.len().alias("count"))
          .sort("count", descending=True)
          .head(limit)
          .to_dicts()
    )

def get_top_users(limit: int = 10) -> list[dict]:
    df = load_df("command_stats", COMMAND_STATS_SCHEMA)
    if df.is_empty():
        return []
    return (
        df.group_by("sender")
          .agg(pl.len().alias("count"))
          .sort("count", descending=True)
          .head(limit)
          .to_dicts()
    )

# ─── Analytics (nuevos) ───────────────────────────────────────────────────────

def get_activity_by_hour() -> list[dict]:
    """Actividad por hora del día — útil para saber cuándo más usa el bot"""
    df = load_df("messages", MESSAGE_SCHEMA)
    if df.is_empty():
        return []
    return (
        df.with_columns(
            pl.col("timestamp").str.slice(11, 2).cast(pl.Int32).alias("hour")
        )
        .group_by("hour")
        .agg(pl.len().alias("count"))
        .sort("hour")
        .to_dicts()
    )

def get_active_groups(limit: int = 10) -> list[dict]:
    """Grupos más activos por cantidad de mensajes"""
    df = load_df("messages", MESSAGE_SCHEMA)
    if df.is_empty():
        return []
    return (
        df.filter(pl.col("isGroup") == True)
          .group_by("jid")
          .agg(pl.len().alias("count"))
          .sort("count", descending=True)
          .head(limit)
          .to_dicts()
    )

def get_command_success_rate() -> list[dict]:
    """Tasa de éxito por comando"""
    df = load_df("command_stats", COMMAND_STATS_SCHEMA)
    if df.is_empty():
        return []
    return (
        df.group_by("command")
          .agg([
              pl.len().alias("total"),
              pl.col("success").sum().alias("success_count"),
          ])
          .with_columns(
              (pl.col("success_count") / pl.col("total") * 100)
              .round(1)
              .alias("success_rate")
          )
          .sort("total", descending=True)
          .to_dicts()
    )

# ─── Archive — rotar logs viejos a archivo por fecha ─────────────────────────

def archive_old_messages(keep_last: int = 5000) -> int:
    """
    Mueve mensajes viejos a archivo diario — mantiene solo keep_last en activo.
    Retorna cuántos se archivaron.
    """
    df = load_df("messages", MESSAGE_SCHEMA)
    if len(df) <= keep_last:
        return 0

    sorted_df  = df.sort("timestamp", descending=True)
    active     = sorted_df.head(keep_last)
    to_archive = sorted_df.tail(len(df) - keep_last)

    # guardar archivo
    archive_path = _archive_path("messages")
    if archive_path.exists():
        existing = pl.read_parquet(str(archive_path))
        to_archive = pl.concat([existing, to_archive], how="diagonal")
    to_archive.write_parquet(str(archive_path), compression="snappy")

    # actualizar activo
    save_df(active, "messages")
    return len(df) - keep_last

def archive_old_command_stats(keep_last: int = 10000) -> int:
    """Rota stats de comandos viejos a archivo"""
    df = load_df("command_stats", COMMAND_STATS_SCHEMA)
    if len(df) <= keep_last:
        return 0

    sorted_df  = df.sort("timestamp", descending=True)
    active     = sorted_df.head(keep_last)
    to_archive = sorted_df.tail(len(df) - keep_last)

    archive_path = _archive_path("command_stats")
    if archive_path.exists():
        existing = pl.read_parquet(str(archive_path))
        to_archive = pl.concat([existing, to_archive], how="diagonal")
    to_archive.write_parquet(str(archive_path), compression="snappy")

    save_df(active, "command_stats")
    return len(df) - keep_last

def cleanup_old_archives(keep_days: int = 30) -> int:
    """Elimina archivos de más de keep_days días"""
    if not ARCHIVE_DIR.exists():
        return 0
    files   = sorted(ARCHIVE_DIR.glob("*.parquet"))
    to_del  = files[:-keep_days] if len(files) > keep_days else []
    for f in to_del:
        f.unlink()
    return len(to_del)

# ─── Health / Break / Alert archive ──────────────────────────────────────────

def archive_health(report: dict) -> None:
    append_row({
        'timestamp': report.get('timestamp', ''),
        'status':    report.get('status', ''),
        'score':     float(report.get('score', 0)),
        'alerts':    str(report.get('alerts', [])),
    }, 'health_logs')

def archive_break(event: dict) -> None:
    append_row({
        'break_id':   event.get('id', ''),
        'type':       event.get('type', ''),
        'severity':   event.get('severity', ''),
        'message':    event.get('message', ''),
        'count':      int(event.get('count', 1)),
        'frequency':  float(event.get('frequency', 0)),
        'first_seen': event.get('first_seen', ''),
        'last_seen':  event.get('last_seen', ''),
    }, 'break_logs')

def archive_alert(alert: dict) -> None:
    append_row({
        'alert_id':  alert.get('id', ''),
        'level':     alert.get('level', ''),
        'source':    alert.get('source', ''),
        'title':     alert.get('title', ''),
        'count':     int(alert.get('count', 1)),
        'timestamp': alert.get('timestamp', ''),
    }, 'alert_logs')