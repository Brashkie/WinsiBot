import uuid
import polars as pl
from pathlib import Path
from datetime import datetime, timedelta
from .parquet_store import load_df, save_df

PENDING_SCHEMA = pl.Schema({
    "id":        pl.String,
    "jid":       pl.String,
    "sender":    pl.String,
    "text":      pl.String,
    "command":   pl.String,
    "timestamp": pl.String,
    "processed": pl.Boolean,
})

def save_pending(record: dict) -> None:
    """Guarda mensaje como pendiente al llegar"""
    record.setdefault("id",        str(uuid.uuid4()))
    record.setdefault("processed", False)
    record.setdefault("timestamp", datetime.utcnow().isoformat())
    existing = load_df("pending", PENDING_SCHEMA)
    new_row  = pl.DataFrame([record], schema=PENDING_SCHEMA)
    combined = pl.concat([existing, new_row], how="diagonal") if len(existing) > 0 else new_row
    save_df(combined, "pending")

def get_pending(max_age_minutes: int = 30) -> list[dict]:
    """Retorna mensajes pendientes no procesados"""
    df = load_df("pending", PENDING_SCHEMA)
    if df.is_empty():
        return []
    cutoff = (datetime.utcnow() - timedelta(minutes=max_age_minutes)).isoformat()
    return (
        df.filter(
            (pl.col("processed") == False) &
            (pl.col("timestamp") >= cutoff)
        )
        .to_dicts()
    )

def mark_processed(ids: list[str]) -> None:
    """Marca mensajes como procesados"""
    df = load_df("pending", PENDING_SCHEMA)
    if df.is_empty():
        return
    df = df.with_columns(
        pl.when(pl.col("id").is_in(ids))
          .then(True)
          .otherwise(pl.col("processed"))
          .alias("processed")
    )
    save_df(df, "pending")

def count_pending(max_age_minutes: int = 30) -> int:
    return len(get_pending(max_age_minutes))

def clean_old_pending(days: int = 1) -> None:
    """Limpia pendientes viejos"""
    df = load_df("pending", PENDING_SCHEMA)
    if df.is_empty():
        return
    cutoff = (datetime.utcnow() - timedelta(days=days)).isoformat()
    save_df(df.filter(pl.col("timestamp") >= cutoff), "pending")