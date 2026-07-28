import asyncio
from fastapi import APIRouter
from fastapi.responses import JSONResponse
from pydantic import BaseModel

router = APIRouter()

class ImageRequest(BaseModel):
    image:    str
    scale:    int = 2
    bg:       str = 'transparent'
    method:   str = 'nafnet'

# Todos estos son procesamiento de imagen real (PIL/torch) — decenas de ms a
# varios segundos según el modelo. Llamados directo acá bloqueaban el único
# hilo del event loop de Uvicorn (--workers 1) por toda esa duración,
# congelando CUALQUIER otro endpoint mientras tanto — incluido /spam/check,
# que se llama en cada mensaje de cada grupo. asyncio.to_thread los saca del
# hilo principal, mismo patrón que ya usan fast.py/ml.py.
@router.post('/upscale')
async def anime_upscale(req: ImageRequest):
    try:
        from ml.anime import anime4k_upscale
        result = await asyncio.to_thread(anime4k_upscale, req.image, req.scale)
        return { 'success': True, 'data': result }
    except Exception as e:
        return JSONResponse({ 'success': False, 'error': str(e) }, status_code=500)

@router.post('/removebg')
async def anime_removebg(req: ImageRequest):
    try:
        from ml.anime import remove_background
        result = await asyncio.to_thread(remove_background, req.image, req.bg)
        return { 'success': True, 'data': result }
    except Exception as e:
        return JSONResponse({ 'success': False, 'error': str(e) }, status_code=500)

@router.post('/tags')
async def anime_tags(req: ImageRequest):
    try:
        from ml.anime import get_anime_tags
        result = await asyncio.to_thread(get_anime_tags, req.image)
        return { 'success': True, 'data': result }
    except Exception as e:
        return JSONResponse({ 'success': False, 'error': str(e) }, status_code=500)

@router.post('/detect')
async def anime_detect(req: ImageRequest):
    try:
        from ml.anime import detect_anime
        result = await asyncio.to_thread(detect_anime, req.image)
        return { 'success': True, 'data': result }
    except Exception as e:
        return JSONResponse({ 'success': False, 'error': str(e) }, status_code=500)

@router.post('/restore')
async def anime_restore(req: ImageRequest):
    try:
        from ml.anime import restore_image
        result = await asyncio.to_thread(restore_image, req.image, req.method)
        return { 'success': True, 'data': result }
    except Exception as e:
        return JSONResponse({ 'success': False, 'error': str(e) }, status_code=500)

@router.post('/convert')
async def anime_convert(req: ImageRequest):
    try:
        from ml.anime import image_to_anime
        result = await asyncio.to_thread(image_to_anime, req.image)
        return { 'success': True, 'data': result }
    except Exception as e:
        return JSONResponse({ 'success': False, 'error': str(e) }, status_code=500)
