from fastapi import APIRouter
from fastapi.responses import JSONResponse
from pydantic import BaseModel

router = APIRouter()

class LegoRequest(BaseModel):
    image:      str
    brick_size: int = 20

@router.post('/lego')
async def imagefx_lego(req: LegoRequest):
    try:
        from ml.imagefx import legofy_image
        return { 'success': True, 'data': legofy_image(req.image, req.brick_size) }
    except Exception as e:
        return JSONResponse({ 'success': False, 'error': str(e) }, status_code=500)
