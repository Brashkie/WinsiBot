"""
WinsiBot — DiskCache
Cache en disco ultrarrápido — reemplaza NodeCache y dicts en RAM
"""

import diskcache
from pathlib import Path

CACHE_DIR = Path(__file__).parent.parent.parent / 'data' / 'db' / 'cache'
CACHE_DIR.mkdir(parents=True, exist_ok=True)

# ─── Cache principal ──────────────────────────────────────────────────────────
_cache = diskcache.Cache(
    str(CACHE_DIR),
    size_limit  = 512 * 1024 * 1024,  # 512MB máximo
    disk_min_file_size = 0,
    statistics  = True,
)

# ─── API simple ───────────────────────────────────────────────────────────────
def get(key: str, default=None):
    return _cache.get(key, default)

def set(key: str, value, ttl: int = 0) -> bool:
    return _cache.set(key, value, expire=ttl if ttl > 0 else None)

def delete(key: str) -> bool:
    return _cache.delete(key)

def exists(key: str) -> bool:
    return key in _cache

def incr(key: str, delta: int = 1, default: int = 0) -> int:
    try:
        return _cache.incr(key, delta=delta, default=default)
    except Exception:
        return default

# ─── Stats ────────────────────────────────────────────────────────────────────
def get_stats() -> dict:
    try:
        hits, misses = _cache.stats()
        return {
            'hits':      hits,
            'misses':    misses,
            'size':      _cache.volume(),
            'count':     len(_cache),
        }
    except Exception:
        return {}