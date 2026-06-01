import polars as pl
import pandas as pd
import numpy as np
from typing import Any

def run_pipeline(payload: dict) -> dict[str, Any]:
    """
    ETL pipeline con Polars.
    """
    data = payload.get('data', [])

    if not data:
        return {'rows': 0, 'stats': {}}

    df = pl.DataFrame(data)

    stats = {}
    for col in df.columns:
        if df[col].dtype in (pl.Float64, pl.Int64, pl.Float32, pl.Int32):
            stats[col] = {
                'mean':  round(df[col].mean() or 0, 4),
                'std':   round(df[col].std() or 0, 4),
                'min':   df[col].min(),
                'max':   df[col].max(),
                'nulls': df[col].null_count(),
            }

    return {
        'rows':    len(df),
        'columns': df.columns,
        'stats':   stats,
    }