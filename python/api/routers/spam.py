import asyncio
from fastapi import APIRouter
from fastapi.responses import JSONResponse
from pydantic import BaseModel

router = APIRouter()

class SpamCheckRequest(BaseModel):
    sender:          str
    text:            str = ''
    max_hits:        int = 8
    window_ms:       int = 5000
    max_repeats:     int = 3
    flood_window_ms: int = 30000

class SenderRequest(BaseModel):
    sender: str

@router.post('/check')
async def spam_check(req: SpamCheckRequest):
    # Uvicorn corre con --workers 1 — un solo event loop para TODA la API.
    # Este endpoint se llama en CADA mensaje (rateLimit.ts, no solo comandos),
    # es el path más caliente de toda la API — llamar check_message() directo
    # acá bloqueaba ese único hilo por cada mensaje, en cascada bajo ráfaga
    # (mismo patrón ya corregido en ml.py/fast.py, pero éste había quedado
    # afuera). asyncio.to_thread lo saca del hilo del event loop.
    try:
        from ml.spam_guard import check_message
        result = await asyncio.to_thread(
            check_message,
            req.sender, req.text,
            req.max_hits, req.window_ms,
            req.max_repeats, req.flood_window_ms,
        )
        return { 'success': True, 'data': result }
    except Exception as e:
        return JSONResponse({ 'success': False, 'error': str(e) }, status_code=500)

@router.post('/reset')
async def spam_reset(req: SenderRequest):
    try:
        from ml.spam_guard import reset_sender
        reset_sender(req.sender)
        return { 'success': True }
    except Exception as e:
        return JSONResponse({ 'success': False, 'error': str(e) }, status_code=500)

@router.get('/stats')
async def spam_stats():
    try:
        from ml.spam_guard import get_stats
        return { 'success': True, 'data': get_stats() }
    except Exception as e:
        return JSONResponse({ 'success': False, 'error': str(e) }, status_code=500)