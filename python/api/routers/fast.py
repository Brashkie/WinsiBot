from fastapi import APIRouter
from fastapi.responses import JSONResponse
from pydantic import BaseModel

router = APIRouter()

class FastProcessRequest(BaseModel):
    text:       str       = ''
    prefixes:   list[str] = []
    sender:     str       = ''
    jid:        str       = ''
    owner_jids: list[str] = []
    max_hits:   int       = 8
    ttl:        int       = 10

class GroupCacheRequest(BaseModel):
    action:   str  = 'get'
    jid:      str  = ''
    metadata: dict = {}
    ttl:      int  = 300

@router.post('/process')
async def fast_process(req: FastProcessRequest):
    try:
        from fast_utils import process_message_fast
        result = process_message_fast(
            req.text, req.prefixes, req.sender,
            req.jid, req.owner_jids, req.max_hits, req.ttl,
        )
        return { 'success': True, 'data': result }
    except ImportError:
        return JSONResponse({ 'success': False, 'error': 'Cython no disponible' }, status_code=500)
    except Exception as e:
        return JSONResponse({ 'success': False, 'error': str(e) }, status_code=500)

@router.get('/cache/stats')
async def cache_stats():
    try:
        from fast_utils import get_cache_stats
        return { 'success': True, 'data': get_cache_stats() }
    except Exception as e:
        return JSONResponse({ 'success': False, 'error': str(e) }, status_code=500)

@router.post('/group/cache')
async def group_cache(req: GroupCacheRequest):
    try:
        from fast_utils import cache_group, get_cached_group, invalidate_group
        if req.action == 'set':
            cache_group(req.jid, req.metadata, req.ttl)
            return { 'success': True, 'data': { 'cached': True } }
        elif req.action == 'get':
            return { 'success': True, 'data': get_cached_group(req.jid) }
        elif req.action == 'invalidate':
            invalidate_group(req.jid)
            return { 'success': True, 'data': { 'invalidated': True } }
        return JSONResponse({ 'success': False, 'error': 'action invalida' }, status_code=400)
    except Exception as e:
        return JSONResponse({ 'success': False, 'error': str(e) }, status_code=500)