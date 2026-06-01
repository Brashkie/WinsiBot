"""
WinsiBot — SpamGuard Python wrapper
Carga spam_guard.dll y expone API limpia
"""

import ctypes
import threading
import time
from pathlib import Path

_DLL_PATH = Path(__file__).parent.parent / 'cython_ext' / 'spam_guard.dll'
_lib:      ctypes.CDLL | None = None
_lock:     threading.Lock     = threading.Lock()

# ─── Cargar DLL ───────────────────────────────────────────────────────────────
def _load() -> ctypes.CDLL | None:
    global _lib
    if _lib is not None:
        return _lib
    if not _DLL_PATH.exists():
        return None
    try:
        lib = ctypes.CDLL(str(_DLL_PATH))

        lib.check_rate_limit.restype  = ctypes.c_int
        lib.check_rate_limit.argtypes = [
            ctypes.c_char_p, ctypes.c_int, ctypes.c_longlong
        ]
        lib.check_flood.restype  = ctypes.c_int
        lib.check_flood.argtypes = [
            ctypes.c_char_p, ctypes.c_char_p, ctypes.c_int, ctypes.c_longlong
        ]
        lib.check_message.restype  = ctypes.c_int
        lib.check_message.argtypes = [
            ctypes.c_char_p, ctypes.c_char_p,
            ctypes.c_int, ctypes.c_longlong,
            ctypes.c_int, ctypes.c_longlong,
        ]
        lib.get_cooldown_remaining.restype  = ctypes.c_longlong
        lib.get_cooldown_remaining.argtypes = [ctypes.c_char_p]
        lib.reset_sender.restype  = None
        lib.reset_sender.argtypes = [ctypes.c_char_p]
        lib.get_active_senders.restype  = ctypes.c_int
        lib.get_active_senders.argtypes = []
        lib.cleanup_old_senders.restype  = None
        lib.cleanup_old_senders.argtypes = [ctypes.c_longlong]

        _lib = lib
        return _lib
    except Exception as e:
        print(f'[SpamGuard] DLL no cargada: {e}')
        return None

# ─── Config por defecto ───────────────────────────────────────────────────────
DEFAULT_MAX_HITS      = 8      # mensajes máx en ventana
DEFAULT_WINDOW_MS     = 5000   # ventana de 5s
DEFAULT_MAX_REPEATS   = 3      # misma frase 3 veces = flood
DEFAULT_FLOOD_WIN_MS  = 30000  # ventana flood 30s

# ─── API pública ──────────────────────────────────────────────────────────────
def check_message(
    sender:        str,
    text:          str  = '',
    max_hits:      int  = DEFAULT_MAX_HITS,
    window_ms:     int  = DEFAULT_WINDOW_MS,
    max_repeats:   int  = DEFAULT_MAX_REPEATS,
    flood_win_ms:  int  = DEFAULT_FLOOD_WIN_MS,
) -> dict:
    """
    Check combinado rate limit + flood.
    Retorna dict con: allowed, reason, cooldown_ms
    """
    lib = _load()
    if lib is None:
        return { 'allowed': True, 'reason': 'dll_unavailable', 'cooldown_ms': 0 }

    with _lock:
        result = lib.check_message(
            sender.encode(),
            text.encode()[:511],
            max_hits,
            window_ms,
            max_repeats,
            flood_win_ms,
        )

    REASONS = {
        0: 'ok',
        1: 'rate_limit',
        2: 'blocked',
        3: 'flood',
    }

    allowed     = result == 0
    reason      = REASONS.get(result, 'unknown')
    cooldown_ms = 0

    if not allowed:
        lib2 = _load()
        if lib2:
            cooldown_ms = int(lib2.get_cooldown_remaining(sender.encode()))

    return {
        'allowed':     allowed,
        'reason':      reason,
        'cooldown_ms': cooldown_ms,
        'code':        result,
    }

def reset_sender(sender: str) -> None:
    lib = _load()
    if lib:
        with _lock:
            lib.reset_sender(sender.encode())

def get_stats() -> dict:
    lib = _load()
    if not lib:
        return { 'active_senders': 0, 'dll_loaded': False }
    return {
        'active_senders': lib.get_active_senders(),
        'dll_loaded':     True,
    }

def start_cleanup(interval_s: int = 300) -> None:
    """Limpia senders inactivos cada 5min en background"""
    def _loop():
        while True:
            time.sleep(interval_s)
            lib = _load()
            if lib:
                with _lock:
                    lib.cleanup_old_senders(600_000)  # inactivos >10min
    import threading
    t = threading.Thread(target=_loop, daemon=True, name='SpamGuardCleanup')
    t.start()