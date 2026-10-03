"""
WinsiBot — API de Python.

Lo que queda acá después de la 8.11.0 son los comandos de anime: redes
neuronales con torch (AnimeGANv2, NAFNet, isnetis) y un endpoint de salud.
Todo lo demás —clasificación de intenciones, filtro de spam, personalidad,
humor, reputación, catálogo de comandos, cliente de Ollama, perfiles de estilo,
mosaico LEGO y búsqueda de imágenes— está en Rust.

El arranque ya no hace nada: ni base de datos, ni calentamiento de modelos, ni
hilos de fondo. Los routers importan torch y Pillow DENTRO de cada handler y con
try/except, así que la API levanta aunque no estén instalados y solo fallan los
endpoints que de verdad los necesitan.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))
sys.path.insert(0, str(Path(__file__).parent))
sys.path.insert(0, str(Path(__file__).parent.parent / 'cython_ext'))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.gzip import GZipMiddleware

# ─── App ──────────────────────────────────────────────────────────────────────
#
# Sin `lifespan`: antes abría la base, creaba tablas que nadie leía, levantaba
# un hilo para precalentar el clasificador de intenciones (que hoy está en
# nlp.rs) y otro para la limpieza del filtro de spam (que está en
# rate_limiter.rs). Los tres iban dentro de un try/except que se tragaba
# cualquier error, así que cuando dejaron de funcionar nadie se enteró.
app = FastAPI(
    title     = 'WinsiBot API',
    version   = '8.11.0',
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
