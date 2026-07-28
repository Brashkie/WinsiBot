import asyncio
from fastapi import APIRouter
from fastapi.responses import JSONResponse
from pydantic import BaseModel

router = APIRouter()

class GroupRequest(BaseModel):
    jid:  str = ''

# parquet_store hace I/O de disco síncrono (lectura/escritura de archivos
# .parquet) — directo acá bloqueaba el único hilo del event loop de Uvicorn
# (--workers 1) mientras dura. Menos frecuente que /spam/check (solo se
# llama desde comandos de admin), pero mismo problema de fondo.
@router.get('/{jid:path}')
async def get_group(jid: str):
    try:
        from data.parquet_store import get_or_create_group
        result = await asyncio.to_thread(get_or_create_group, jid)
        return { 'success': True, 'data': result }
    except Exception as e:
        return JSONResponse({ 'success': False, 'error': str(e) }, status_code=500)

@router.post('')
async def upsert_group(req: dict):
    try:
        from data.parquet_store import upsert_group as _upsert
        await asyncio.to_thread(_upsert, req)
        return { 'success': True, 'data': { 'saved': True } }
    except Exception as e:
        return JSONResponse({ 'success': False, 'error': str(e) }, status_code=500)

@router.get('')
async def get_all_groups():
    try:
        from data.parquet_store import load_all_groups
        groups = await asyncio.to_thread(load_all_groups)
        return { 'success': True, 'data': groups.to_dicts() }
    except Exception as e:
        return JSONResponse({ 'success': False, 'error': str(e) }, status_code=500)
