from fastapi import APIRouter
from fastapi.responses import JSONResponse
from pydantic import BaseModel

router = APIRouter()

class GroupRequest(BaseModel):
    jid:  str = ''

@router.get('/{jid:path}')
async def get_group(jid: str):
    try:
        from data.parquet_store import get_or_create_group
        return { 'success': True, 'data': get_or_create_group(jid) }
    except Exception as e:
        return JSONResponse({ 'success': False, 'error': str(e) }, status_code=500)

@router.post('')
async def upsert_group(req: dict):
    try:
        from data.parquet_store import upsert_group as _upsert
        _upsert(req)
        return { 'success': True, 'data': { 'saved': True } }
    except Exception as e:
        return JSONResponse({ 'success': False, 'error': str(e) }, status_code=500)

@router.get('')
async def get_all_groups():
    try:
        from data.parquet_store import load_all_groups
        return { 'success': True, 'data': load_all_groups().to_dicts() }
    except Exception as e:
        return JSONResponse({ 'success': False, 'error': str(e) }, status_code=500)