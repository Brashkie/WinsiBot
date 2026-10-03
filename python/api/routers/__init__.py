from fastapi import APIRouter
from .health import router as health_router
from .anime  import router as anime_router

# Lo que queda. Todo lo demás se fue a Rust en la 8.11.0:
#   /ml      → nlp.rs (clasificador por reglas) y rate_limiter.rs (spam)
#   /search  → imagesearch.rs
#   /imagefx → imagefx.rs
#   /ai      → personality.rs (modos, plantillas, humor), user_memory.rs
#              (reputación) y ai_chat.rs (Ollama, GPT, Gemini, Claude)
#   /hepein  → ai_chat.rs
#
# /anime es lo único que de verdad necesita un intérprete: son redes
# neuronales con torch. Ver requirements-optional.txt.
main_router = APIRouter()
main_router.include_router(health_router, prefix='/health', tags=['health'])
main_router.include_router(anime_router,  prefix='/anime',  tags=['anime'])
