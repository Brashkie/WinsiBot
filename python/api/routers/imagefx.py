import asyncio
from fastapi import APIRouter
from fastapi.responses import JSONResponse
from pydantic import BaseModel

router = APIRouter()

class LegoRequest(BaseModel):
    image:      str
    brick_size: int = 20

# Procesamiento de imagen real (PIL) — llamarlo directo bloqueaba el único
# hilo del event loop de Uvicorn (--workers 1) mientras dura, mismo problema
# que en anime.py.
@router.post('/lego')
async def imagefx_lego(req: LegoRequest):
    try:
        from ml.imagefx import legofy_image
        result = await asyncio.to_thread(legofy_image, req.image, req.brick_size)
        return { 'success': True, 'data': result }
    except Exception as e:
        return JSONResponse({ 'success': False, 'error': str(e) }, status_code=500)
