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

class RateLimitMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, max_calls: int = 120, window: int = 60):
        super().__init__(app)
        self.max_calls = max_calls
        self.window    = window

    async def dispatch(self, request: Request, call_next) -> Response:
        ip  = request.client.host if request.client else 'unknown'
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
