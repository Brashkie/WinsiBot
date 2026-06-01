from fastapi import APIRouter
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import Literal

router = APIRouter()

class ImageRequest(BaseModel):
    image:    str
    scale:    int = 2
    bg:       str = 'transparent'
    method:   str = 'nafnet'

@router.post('/upscale')
async def anime_upscale(req: ImageRequest):
    try:
        from ml.anime import anime4k_upscale
        return { 'success': True, 'data': anime4k_upscale(req.image, req.scale) }
    except Exception as e:
        return JSONResponse({ 'success': False, 'error': str(e) }, status_code=500)

@router.post('/removebg')
async def anime_removebg(req: ImageRequest):
    try:
        from ml.anime import remove_background
        return { 'success': True, 'data': remove_background(req.image, req.bg) }
    except Exception as e:
        return JSONResponse({ 'success': False, 'error': str(e) }, status_code=500)

@router.post('/tags')
async def anime_tags(req: ImageRequest):
    try:
        from ml.anime import get_anime_tags
        return { 'success': True, 'data': get_anime_tags(req.image) }
    except Exception as e:
        return JSONResponse({ 'success': False, 'error': str(e) }, status_code=500)

@router.post('/detect')
async def anime_detect(req: ImageRequest):
    try:
        from ml.anime import detect_anime
        return { 'success': True, 'data': detect_anime(req.image) }
    except Exception as e:
        return JSONResponse({ 'success': False, 'error': str(e) }, status_code=500)

@router.post('/restore')
async def anime_restore(req: ImageRequest):
    try:
        from ml.anime import restore_image
        return { 'success': True, 'data': restore_image(req.image, req.method) }
    except Exception as e:
        return JSONResponse({ 'success': False, 'error': str(e) }, status_code=500)

@router.post('/convert')
async def anime_convert(req: ImageRequest):
    try:
        from ml.anime import image_to_anime
        return { 'success': True, 'data': image_to_anime(req.image) }
    except Exception as e:
        return JSONResponse({ 'success': False, 'error': str(e) }, status_code=500)