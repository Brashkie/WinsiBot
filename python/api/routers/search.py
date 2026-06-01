from fastapi import APIRouter
from fastapi.responses import JSONResponse
from pydantic import BaseModel

router = APIRouter()

class SearchRequest(BaseModel):
    query:       str
    max_results: int = 10

@router.post('/image')
async def search_image(req: SearchRequest):
    try:
        from ml.search import search_and_download
        return { 'success': True, 'data': search_and_download(req.query) }
    except Exception as e:
        return JSONResponse({ 'success': False, 'error': str(e) }, status_code=500)

@router.post('/images')
async def search_images(req: SearchRequest):
    try:
        from ml.search import search_images as _search
        return { 'success': True, 'data': _search(req.query, req.max_results) }
    except Exception as e:
        return JSONResponse({ 'success': False, 'error': str(e) }, status_code=500)