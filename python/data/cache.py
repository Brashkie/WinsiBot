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

# ─── Fanout para operaciones concurrentes ─────────────────────────────────────
_fanout = diskcache.FanoutCache(
    str(CACHE_DIR / 'fanout'),
    shards     = 4,
    timeout    = 1,
    size_limit = 256 * 1024 * 1024,
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

# ─── Rate limit usando DiskCache ──────────────────────────────────────────────
def rate_limit_check(key: str, max_hits: int, window_s: int) -> bool:
    """
    Sliding window rate limit usando DiskCache.
    Retorna True si está permitido, False si supera el límite.
    """
    import time
    now    = time.time()
    hits   = _cache.get(f'rl:{key}', [])
    hits   = [t for t in hits if now - t < window_s]
    if len(hits) >= max_hits:
        return False
    hits.append(now)
    _cache.set(f'rl:{key}', hits, expire=window_s)
    return True

# ─── Group metadata cache ─────────────────────────────────────────────────────
def cache_group(jid: str, data: dict, ttl: int = 300) -> None:
    _cache.set(f'group:{jid}', data, expire=ttl)

def get_group(jid: str) -> dict | None:
    return _cache.get(f'group:{jid}')

def invalidate_group(jid: str) -> None:
    _cache.delete(f'group:{jid}')

# ─── Cooldowns ────────────────────────────────────────────────────────────────
def set_cooldown(key: str, ttl_ms: int) -> None:
    import time
    _cache.set(f'cd:{key}', time.time(), expire=ttl_ms / 1000)

def get_cooldown_remaining(key: str) -> int:
    """Retorna ms restantes, 0 si no hay cooldown"""
    import time
    val = _cache.get(f'cd:{key}')
    if val is None:
        return 0
    # diskcache no expone TTL restante directamente — usar expire_time
    try:
        _, expire = _cache.peekitem(f'cd:{key}')
        remaining = (expire - time.time()) * 1000
        return max(0, int(remaining))
    except Exception:
        return 0

def clear_cooldown(key: str) -> None:
    _cache.delete(f'cd:{key}')

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

def close() -> None:
    _cache.close()
    _fanout.close()