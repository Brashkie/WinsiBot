import polars as pl
import pandas as pd
import numpy as np
from pathlib import Path
from datetime import datetime, timedelta
from typing import Any
from .parquet_store import load_df, save_df
from .schemas import MESSAGE_SCHEMA, USER_SCHEMA, COMMAND_STATS_SCHEMA

# ─── Análisis de mensajes ─────────────────────────────────────────────────────

def messages_per_hour() -> list[dict]:
    df = load_df("messages", MESSAGE_SCHEMA)
    if df.is_empty():
        return []
    return (
        df.with_columns(
            pl.col("timestamp").str.slice(11, 2).alias("hour")
        )
        .group_by("hour")
        .agg(pl.len().alias("count"))
        .sort("hour")
        .to_dicts()
    )

def messages_per_day(days: int = 7) -> list[dict]:
    df = load_df("messages", MESSAGE_SCHEMA)
    if df.is_empty():
        return []
    cutoff = (datetime.utcnow() - timedelta(days=days)).isoformat()
    return (
        df.filter(pl.col("timestamp") >= cutoff)
          .with_columns(pl.col("timestamp").str.slice(0, 10).alias("date"))
          .group_by("date")
          .agg(pl.len().alias("count"))
          .sort("date")
          .to_dicts()
    )

def active_users(days: int = 7) -> list[dict]:
    df = load_df("messages", MESSAGE_SCHEMA)
    if df.is_empty():
        return []
    cutoff = (datetime.utcnow() - timedelta(days=days)).isoformat()
    return (
        df.filter(pl.col("timestamp") >= cutoff)
          .group_by("sender")
          .agg(pl.len().alias("messages"))
          .sort("messages", descending=True)
          .head(20)
          .to_dicts()
    )

# ─── Stats generales ──────────────────────────────────────────────────────────

def general_stats() -> dict[str, Any]:
    messages = load_df("messages", MESSAGE_SCHEMA)
    users    = load_df("users",    USER_SCHEMA)
    cmds     = load_df("command_stats", COMMAND_STATS_SCHEMA)

    today = datetime.utcnow().strftime("%Y-%m-%d")

    return {
        "total_messages":   len(messages),
        "total_users":      len(users),
        "total_commands":   len(cmds),
        "messages_today":   len(messages.filter(pl.col("timestamp").str.starts_with(today))) if not messages.is_empty() else 0,
        "commands_today":   len(cmds.filter(pl.col("timestamp").str.starts_with(today))) if not cmds.is_empty() else 0,
        "banned_users":     len(users.filter(pl.col("banned") == True)) if not users.is_empty() else 0,
        "premium_users":    len(users.filter(pl.col("premium") == True)) if not users.is_empty() else 0,
        "generated_at":     datetime.utcnow().isoformat(),
    }

# ─── Export ───────────────────────────────────────────────────────────────────

def export_to_csv(name: str, output_path: str) -> str:
    df = load_df(name)
    if df.is_empty():
        return ""
    path = Path(output_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    df.write_csv(str(path))
    return str(path)

def export_to_json(name: str) -> list[dict]:
    df = load_df(name)
    return df.to_dicts() if not df.is_empty() else []

# ─── Limpieza ─────────────────────────────────────────────────────────────────

def clean_old_messages(days: int = 30) -> int:
    df = load_df("messages", MESSAGE_SCHEMA)
    if df.is_empty():
        return 0
    cutoff  = (datetime.utcnow() - timedelta(days=days)).isoformat()
    before  = len(df)
    cleaned = df.filter(pl.col("timestamp") >= cutoff)
    save_df(cleaned, "messages")
    return before - len(cleaned)

def clean_old_command_stats(days: int = 30) -> int:
    df = load_df("command_stats", COMMAND_STATS_SCHEMA)
    if df.is_empty():
        return 0
    cutoff  = (datetime.utcnow() - timedelta(days=days)).isoformat()
    before  = len(df)
    cleaned = df.filter(pl.col("timestamp") >= cutoff)
    save_df(cleaned, "command_stats")
    return before - len(cleaned)