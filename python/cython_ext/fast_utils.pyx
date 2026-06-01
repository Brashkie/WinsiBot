# cython: language_level=3
# cython: boundscheck=False
# cython: wraparound=False
# cython: cdivision=True

from libc.string cimport strlen
from libc.stdlib cimport malloc, free

# ─── Caches globales ──────────────────────────────────────────────────────────
cdef dict _rate_cache     = {}
cdef dict _cooldown_cache = {}
cdef dict _group_cache    = {}
cdef dict _msg_cache      = {}

# ─── Parser de comandos ───────────────────────────────────────────────────────
def parse_command(str text, list prefixes):
    """Detecta prefijo y extrae comando + args de forma rapida"""
    cdef str prefix
    cdef str rest
    cdef list parts

    for prefix in prefixes:
        if text.startswith(prefix):
            rest  = text[len(prefix):].strip()
            parts = rest.split()
            if not parts:
                return None, [], prefix
            return parts[0].lower(), parts[1:], prefix

    return None, [], ''

# ─── Limpieza de texto ────────────────────────────────────────────────────────
def clean_text(str text):
    """Elimina espacios y convierte a lowercase"""
    cdef str result
    result = text.strip().lower()
    return result

# ─── Formateo de JID ─────────────────────────────────────────────────────────
def format_jid(str jid):
    """Extrae numero de un JID de WhatsApp"""
    cdef str result
    result = (jid
        .replace('@s.whatsapp.net', '')
        .replace('@g.us', '')
        .replace('@lid', '')
        .replace(':0', '')
        .replace('+', '')
        .strip()
    )
    return result

# ─── Deteccion de tipo de chat ────────────────────────────────────────────────
def is_group(str jid):
    """Detecta si un JID es de grupo"""
    return jid.endswith('@g.us')

# ─── Rate limit — sliding window ─────────────────────────────────────────────
def check_rate_limit(str sender, int max_hits, int ttl_seconds):
    """
    Sliding window rate limit — mas preciso que contador simple
    Retorna (allowed: bool, hits: int)
    """
    import time
    cdef double now    = time.time()
    cdef double cutoff = now - ttl_seconds
    cdef list   hits
    cdef int    count

    if sender not in _rate_cache:
        _rate_cache[sender] = [now]
        return True, 1

    hits  = [h for h in _rate_cache[sender] if h > cutoff]
    count = len(hits)

    if count >= max_hits:
        _rate_cache[sender] = hits
        return False, count

    hits.append(now)
    _rate_cache[sender] = hits
    return True, len(hits)

def clear_rate_cache():
    """Limpia el cache de rate limit"""
    global _rate_cache
    _rate_cache = {}

def get_rate_stats(str sender):
    """Retorna stats del rate limit de un usuario"""
    import time
    cdef double now = time.time()
    hits = _rate_cache.get(sender, [])
    return {
        'hits':       len(hits),
        'sender':     sender,
        'last_hit':   hits[-1] if hits else 0.0,
        'time_since': now - hits[-1] if hits else 0.0,
    }

# ─── Cooldown ─────────────────────────────────────────────────────────────────
def get_cooldown_remaining(str key, double cooldown_ms):
    """Verifica cooldown — retorna ms restantes, 0 si ya paso"""
    import time
    cdef double now     = time.time() * 1000
    cdef double last    = _cooldown_cache.get(key, 0.0)
    cdef double elapsed = now - last

    if elapsed >= cooldown_ms:
        return 0.0
    return cooldown_ms - elapsed

def set_cooldown(str key):
    """Registra timestamp de cooldown"""
    import time
    _cooldown_cache[key] = time.time() * 1000

def clear_cooldown(str key):
    """Limpia cooldown de una key"""
    if key in _cooldown_cache:
        del _cooldown_cache[key]

# ─── Detector de spam de texto ────────────────────────────────────────────────
def is_spam_text(str text, int max_len=1000, int max_repeat=10):
    """
    Detecta texto spam en C puro:
    - texto muy largo
    - caracteres repetidos N veces seguidas
    """
    cdef int i
    cdef int count  = 1
    cdef int length = len(text)

    if length > max_len:
        return True

    if length < 3:
        return False

    for i in range(1, length):
        if text[i] == text[i - 1]:
            count += 1
            if count >= max_repeat:
                return True
        else:
            count = 1

    return False

# ─── Message Pipeline — procesar mensaje en C ────────────────────────────────
def process_message_fast(
    str text,
    list prefixes,
    str sender,
    str jid,
    list owner_jids,
    int max_hits = 8,
    int ttl      = 10,
):
    """
    Procesa un mensaje completo en C:
    - detecta prefijo y comando
    - verifica rate limit
    - verifica si es owner
    - verifica si es grupo
    Todo en una sola llamada C — sin overhead de Python
    """
    cdef bint is_grp = jid.endswith('@g.us')
    cdef bint is_own = False
    cdef bint allowed
    cdef int  hits
    cdef str  prefix = ''
    cdef str  cmd    = ''
    cdef list args   = []

    # normalizar numero del sender
    cdef str sender_num = (sender
        .replace('@s.whatsapp.net', '')
        .replace('@lid', '')
        .replace('+', '')
        .strip()
    )

    # detectar owner
    for o in owner_jids:
        o_num = (str(o)
            .replace('@s.whatsapp.net', '')
            .replace('@lid', '')
            .replace('+', '')
            .strip()
        )
        if o_num == sender_num or o == sender:
            is_own = True
            break

    # rate limit — owners no tienen limite
    if not is_own:
        allowed, hits = check_rate_limit(sender, max_hits, ttl)
    else:
        allowed = True
        hits    = 0

    # parsear comando
    for p in prefixes:
        if text.startswith(p):
            prefix = p
            rest   = text[len(p):].strip()
            parts  = rest.split()
            if parts:
                cmd  = parts[0].lower()
                args = parts[1:]
            break

    return {
        'cmd':      cmd,
        'args':     args,
        'prefix':   prefix,
        'is_group': is_grp,
        'is_owner': is_own,
        'allowed':  allowed,
        'hits':     hits,
        'has_cmd':  len(cmd) > 0,
    }

# ─── Group metadata cache ─────────────────────────────────────────────────────
def cache_group(str group_jid, dict metadata, int ttl=300):
    """Cachea metadata de grupo con TTL"""
    import time
    _group_cache[group_jid] = {
        'data':    metadata,
        'expires': time.time() + ttl,
    }

def get_cached_group(str group_jid):
    """Obtiene grupo del cache, None si expiro"""
    import time
    cdef double now = time.time()
    entry = _group_cache.get(group_jid)
    if not entry:
        return None
    if entry['expires'] < now:
        del _group_cache[group_jid]
        return None
    return entry['data']

def invalidate_group(str group_jid):
    """Invalida cache de un grupo"""
    if group_jid in _group_cache:
        del _group_cache[group_jid]

def get_cache_stats():
    """Stats de todos los caches"""
    return {
        'rate_entries':     len(_rate_cache),
        'cooldown_entries': len(_cooldown_cache),
        'group_entries':    len(_group_cache),
        'msg_entries':      len(_msg_cache),
    }

# ─── Formateo de bytes ────────────────────────────────────────────────────────
def format_bytes(long long size):
    """Convierte bytes a string legible"""
    cdef double s = size
    cdef list units = ['B', 'KB', 'MB', 'GB', 'TB']
    cdef int i = 0
    while s >= 1024 and i < len(units) - 1:
        s /= 1024
        i += 1
    return f"{s:.2f} {units[i]}"

# ─── Formateo de duracion ─────────────────────────────────────────────────────
def format_duration(int seconds):
    """Convierte segundos a mm:ss o hh:mm:ss"""
    cdef int h = seconds // 3600
    cdef int m = (seconds % 3600) // 60
    cdef int s = seconds % 60
    if h > 0:
        return f"{h}:{m:02d}:{s:02d}"
    return f"{m}:{s:02d}"

# ─── Limpiar caches viejos ────────────────────────────────────────────────────
def cleanup_caches(int max_age_seconds=300):
    """
    Limpia entradas viejas de los caches para liberar RAM
    Llamar periodicamente desde Python
    """
    import time
    cdef double now       = time.time()
    cdef double cutoff    = now - max_age_seconds
    cdef double cutoff_ms = (now - max_age_seconds) * 1000
    cdef list   to_delete

    # limpiar rate cache
    to_delete = [k for k, v in _rate_cache.items()
                 if not v or max(v) < cutoff]
    for k in to_delete:
        del _rate_cache[k]

    # limpiar cooldown cache
    to_delete = [k for k, v in _cooldown_cache.items()
                 if v < cutoff_ms]
    for k in to_delete:
        del _cooldown_cache[k]

    # limpiar group cache expirado
    to_delete = [k for k, v in _group_cache.items()
                 if v.get('expires', 0) < now]
    for k in to_delete:
        del _group_cache[k]

    return {
        'rate_entries':     len(_rate_cache),
        'cooldown_entries': len(_cooldown_cache),
        'group_entries':    len(_group_cache),
    }