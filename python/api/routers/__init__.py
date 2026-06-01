from fastapi import APIRouter
from .health     import router as health_router
from .ai         import router as ai_router
from .spam       import router as spam_router
from .pending    import router as pending_router
from .ml         import router as ml_router
from .tasks      import router as tasks_router
from .users      import router as users_router
from .groups     import router as groups_router
from .stats      import router as stats_router
from .ratelimit  import router as ratelimit_router
from .cache      import router as cache_router
from .anime      import router as anime_router
from .search     import router as search_router
from .fast       import router as fast_router
from .messages   import router as messages_router

main_router = APIRouter()
main_router.include_router(health_router,   prefix='/health',    tags=['health'])
main_router.include_router(ai_router,       prefix='/ai',        tags=['ai'])
main_router.include_router(spam_router,     prefix='/spam',      tags=['spam'])
main_router.include_router(pending_router,  prefix='/pending',   tags=['pending'])
main_router.include_router(ml_router,       prefix='/ml',        tags=['ml'])
main_router.include_router(tasks_router,    prefix='/tasks',     tags=['tasks'])
main_router.include_router(users_router,    prefix='/users',     tags=['users'])
main_router.include_router(groups_router,   prefix='/groups',    tags=['groups'])
main_router.include_router(stats_router,    prefix='/stats',     tags=['stats'])
main_router.include_router(ratelimit_router,prefix='/ratelimit', tags=['ratelimit'])
main_router.include_router(cache_router,    prefix='/cache',     tags=['cache'])
main_router.include_router(anime_router,    prefix='/anime',     tags=['anime'])
main_router.include_router(search_router,   prefix='/search',    tags=['search'])
main_router.include_router(fast_router,     prefix='/fast',      tags=['fast'])
main_router.include_router(messages_router, prefix='/messages',  tags=['messages'])