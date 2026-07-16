import time
from collections import defaultdict
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response
from datetime import datetime
from rich.console import Console

console = Console()

# ─── Rate limiter en memoria por IP ──────────────────────────────────────────
_rate_store: dict[str, list[float]] = defaultdict(list)

# uvicorn solo escucha en 127.0.0.1 (ver app.py) — este servicio NUNCA queda
# expuesto a internet, el único llamador real es el propio bot de Node.js
# corriendo en la misma máquina. Limitarle la tasa a localhost no protege de
# nada externo (no puede llegar) y sí frena tráfico legítimo — endpoints como
# /api/v1/users se llaman en CADA mensaje entrante, y con varios cientos de
# grupos activos superan fácil el límite genérico pensado para clientes
# externos no confiables.
_LOOPBACK_IPS = {'127.0.0.1', '::1', 'localhost'}

class RateLimitMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, max_calls: int = 120, window: int = 60):
        super().__init__(app)
        self.max_calls = max_calls
        self.window    = window

    async def dispatch(self, request: Request, call_next) -> Response:
        ip = request.client.host if request.client else 'unknown'
        if ip in _LOOPBACK_IPS:
            return await call_next(request)

        key = f"{ip}:{request.url.path}"
        now = time.time()

        _rate_store[key] = [t for t in _rate_store[key] if now - t < self.window]

        if len(_rate_store[key]) >= self.max_calls:
            from fastapi.responses import JSONResponse
            return JSONResponse(
                {'success': False, 'error': f'Rate limit excedido ({self.max_calls}/{self.window}s)'},
                status_code=429,
            )

        _rate_store[key].append(now)

        # Limpiar entradas vacías para evitar que _rate_store crezca indefinidamente
        if len(_rate_store) > 2000:
            stale = [k for k, v in list(_rate_store.items()) if not v]
            for k in stale:
                _rate_store.pop(k, None)

        return await call_next(request)

# ─── Sanitizers (sin dependencia de Flask) ───────────────────────────────────
def sanitize_string(value: str, max_len: int = 500) -> str:
    if not isinstance(value, str):
        return str(value)[:max_len]
    return value.strip()[:max_len]

def sanitize_jid(jid: str) -> str:
    jid = sanitize_string(jid, 100)
    if not jid:
        return ''
    if not ('@s.whatsapp.net' in jid or '@g.us' in jid or '@lid' in jid):
        return ''
    return jid
