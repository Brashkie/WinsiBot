import sys
import threading
from pathlib import Path
from contextlib import asynccontextmanager

sys.path.insert(0, str(Path(__file__).parent.parent))
sys.path.insert(0, str(Path(__file__).parent))
sys.path.insert(0, str(Path(__file__).parent.parent / 'cython_ext'))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.gzip import GZipMiddleware

# ─── Lifespan ─────────────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    # DB — errores no deben crashear la API
    try:
        from data.database import init_db
        init_db()
    except Exception as e:
        print(f'[FastAPI] init_db error: {e}')

    try:
        from sqlalchemy_models import init_sqlalchemy
        init_sqlalchemy()
    except Exception as e:
        print(f'[FastAPI] init_sqlalchemy error: {e}')

    # Warmup de modelos ML en background — no bloquea el arranque
    def _warmup():
        try:
            from ai.intent_classifier import get_classifier
            get_classifier()
            print('[FastAPI] Intent classifier listo')
        except Exception as e:
            print(f'[FastAPI] warmup error: {e}')

    threading.Thread(target=_warmup, daemon=True, name='Warmup').start()

    try:
        from ml.spam_guard import start_cleanup
        start_cleanup(interval_s=300)
    except Exception as e:
        print(f'[SpamGuard] cleanup no iniciado: {e}')

    yield

# ─── App ──────────────────────────────────────────────────────────────────────
app = FastAPI(
    title     = 'WinsiBot API',
    version   = '8.0.0',
    lifespan  = lifespan,
    docs_url  = '/docs',
    redoc_url = None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins  = ['*'],
    allow_methods  = ['*'],
    allow_headers  = ['*'],
)

app.add_middleware(GZipMiddleware, minimum_size=500)

from middleware import RateLimitMiddleware
app.add_middleware(RateLimitMiddleware, max_calls=120, window=60)

# ─── Routers ──────────────────────────────────────────────────────────────────
from routers import main_router
app.include_router(main_router, prefix='/api/v1')

# ─── Run ──────────────────────────────────────────────────────────────────────
if __name__ == '__main__':
    import uvicorn
    uvicorn.run(
        'app:app',
        host               = '127.0.0.1',
        port               = 5000,
        workers            = 1,
        loop               = 'asyncio',
        log_level          = 'warning',
        access_log         = False,
        timeout_keep_alive = 10,
    )
