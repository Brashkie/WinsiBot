from fastapi import APIRouter
from fastapi.responses import JSONResponse

router = APIRouter()

@router.get('')
async def stats():
    try:
        from data.etl import general_stats
        return { 'success': True, 'data': general_stats() }
    except Exception as e:
        return JSONResponse({ 'success': False, 'error': str(e) }, status_code=500)

@router.get('/top-commands')
async def top_commands(limit: int = 10):
    try:
        from data.parquet_store import get_top_commands
        return { 'success': True, 'data': get_top_commands(limit) }
    except Exception as e:
        return JSONResponse({ 'success': False, 'error': str(e) }, status_code=500)

@router.get('/top-users')
async def top_users(limit: int = 10):
    try:
        from data.parquet_store import get_top_users
        return { 'success': True, 'data': get_top_users(limit) }
    except Exception as e:
        return JSONResponse({ 'success': False, 'error': str(e) }, status_code=500)

@router.get('/messages-per-day')
async def messages_per_day(days: int = 7):
    try:
        from data.etl import messages_per_day as _mpd
        return { 'success': True, 'data': _mpd(days) }
    except Exception as e:
        return JSONResponse({ 'success': False, 'error': str(e) }, status_code=500)

@router.get('/active-users')
async def active_users(days: int = 7):
    try:
        from data.etl import active_users as _au
        return { 'success': True, 'data': _au(days) }
    except Exception as e:
        return JSONResponse({ 'success': False, 'error': str(e) }, status_code=500)