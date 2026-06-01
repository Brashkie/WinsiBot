from fastapi import APIRouter
from fastapi.responses import JSONResponse
from pydantic import BaseModel

router = APIRouter()

class RateLimitRequest(BaseModel):
    sender:   str
    max_hits: int   = 5
    window:   float = 5.0

class CooldownRequest(BaseModel):
    key:         str
    cooldown_ms: float = 0

@router.post('/check')
async def ratelimit_check(req: RateLimitRequest):
    try:
        try:
            from fast_utils import check_rate_limit, get_rate_stats
            allowed = bool(check_rate_limit(req.sender, req.max_hits, req.window))
            stats   = get_rate_stats(req.sender)
        except ImportError:
            allowed = True
            stats   = {}
        return { 'success': True, 'data': { 'allowed': allowed, 'stats': stats } }
    except Exception as e:
        return JSONResponse({ 'success': False, 'error': str(e) }, status_code=500)

@router.post('/cooldown/check')
async def cooldown_check(req: CooldownRequest):
    try:
        try:
            from fast_utils import get_cooldown_remaining, set_cooldown
            remaining = get_cooldown_remaining(req.key, req.cooldown_ms)
            if remaining <= 0:
                set_cooldown(req.key)
            return { 'success': True, 'data': { 'remaining': remaining, 'allowed': remaining <= 0 } }
        except ImportError:
            return { 'success': True, 'data': { 'remaining': 0, 'allowed': True } }
    except Exception as e:
        return JSONResponse({ 'success': False, 'error': str(e) }, status_code=500)