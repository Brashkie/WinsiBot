import asyncio
from fastapi import APIRouter
from fastapi.responses import JSONResponse
from pydantic import BaseModel

router = APIRouter()

class SearchRequest(BaseModel):
    query:       str
    max_results: int = 10

# ml.search usa la librería `requests` (síncrona) para scrapear Bing, con
# timeouts de hasta 10s por request — llamada directa acá bloqueaba el único
# hilo del event loop de Uvicorn (--workers 1) por hasta 10s completos,
# congelando CUALQUIER otro endpoint (incluido /spam/check, en el hot path de
# cada mensaje) mientras tanto. asyncio.to_thread lo saca del hilo principal.
@router.post('/image')
async def search_image(req: SearchRequest):
    try:
        from ml.search import search_and_download
        result = await asyncio.to_thread(search_and_download, req.query)
        return { 'success': True, 'data': result }
    except Exception as e:
        return JSONResponse({ 'success': False, 'error': str(e) }, status_code=500)

@router.post('/images')
async def search_images(req: SearchRequest):
    try:
        from ml.search import search_images as _search
        result = await asyncio.to_thread(_search, req.query, req.max_results)
        return { 'success': True, 'data': result }
    except Exception as e:
        return JSONResponse({ 'success': False, 'error': str(e) }, status_code=500)