from fastapi import APIRouter
from .health     import router as health_router
from .ai         import router as ai_router
from .ml         import router as ml_router
from .anime      import router as anime_router
from .search     import router as search_router
from .hepein     import router as hepein_router
from .imagefx    import router as imagefx_router

main_router = APIRouter()
main_router.include_router(health_router,   prefix='/health',    tags=['health'])
main_router.include_router(ai_router,       prefix='/ai',        tags=['ai'])
main_router.include_router(hepein_router,   prefix='/hepein',    tags=['hepein'])
main_router.include_router(ml_router,       prefix='/ml',        tags=['ml'])
main_router.include_router(anime_router,    prefix='/anime',     tags=['anime'])
main_router.include_router(search_router,   prefix='/search',    tags=['search'])
main_router.include_router(imagefx_router,  prefix='/imagefx',   tags=['imagefx'])