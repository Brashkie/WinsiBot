from fastapi import APIRouter
from fastapi.responses import JSONResponse

router = APIRouter()

@router.get('/stats')
async def cache_stats():
    try:
        from data.cache import get_stats
        return { 'success': True, 'data': get_stats() }
    except Exception as e:
        return JSONResponse({ 'success': False, 'error': str(e) }, status_code=500)