from fastapi import APIRouter
from fastapi.responses import JSONResponse

router = APIRouter()

@router.get('')
@router.get('/')
async def health():
    try:
        from fast_utils import CYTHON_OK
    except Exception:
        CYTHON_OK = False
    return { 'success': True, 'data': { 'status': 'online', 'version': '8.0.0', 'cython': CYTHON_OK } }

@router.get('/check')
async def health_check_full():
    try:
        from ai.health_monitor import run_health_check
        from dataclasses import asdict
        report = await run_health_check()
        return { 'success': True, 'data': asdict(report) }
    except Exception as e:
        return JSONResponse({ 'success': False, 'error': str(e) }, status_code=500)

@router.get('/history')
async def health_history(limit: int = 50):
    try:
        from ai.health_monitor import HEALTH_LOG
        import json
        if not HEALTH_LOG.exists():
            return { 'success': True, 'data': [] }
        logs = json.loads(HEALTH_LOG.read_text())
        return { 'success': True, 'data': logs[-limit:] }
    except Exception as e:
        return JSONResponse({ 'success': False, 'error': str(e) }, status_code=500)