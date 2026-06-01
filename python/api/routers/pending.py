import asyncio
from fastapi import APIRouter
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import Optional

router = APIRouter()

class PendingRequest(BaseModel):
    id:       str  = ''
    jid:      str  = ''
    sender:   str  = ''
    text:     str  = ''
    command:  str  = ''
    msg_data: dict = {}

class ProcessedRequest(BaseModel):
    ids: list[Optional[str]]

@router.get('/count')
async def pending_count(minutes: int = 30):
    try:
        from data.pending_store import count_pending
        count = await asyncio.to_thread(count_pending, minutes)
        return { 'success': True, 'data': { 'count': count } }
    except Exception as e:
        return JSONResponse({ 'success': False, 'error': str(e) }, status_code=500)

@router.get('')
async def pending_get(minutes: int = 30):
    try:
        from data.pending_store import get_pending
        data = await asyncio.to_thread(get_pending, minutes)
        return { 'success': True, 'data': data }
    except Exception as e:
        return JSONResponse({ 'success': False, 'error': str(e) }, status_code=500)

@router.post('')
async def pending_save(req: PendingRequest):
    try:
        from data.pending_store import save_pending
        await asyncio.to_thread(save_pending, req.dict())
        return { 'success': True, 'data': { 'saved': True } }
    except Exception as e:
        return JSONResponse({ 'success': False, 'error': str(e) }, status_code=500)

@router.post('/processed')
async def pending_processed(req: ProcessedRequest):
    try:
        clean_ids = [i for i in req.ids if i is not None]
        if clean_ids:
            from data.pending_store import mark_processed
            await asyncio.to_thread(mark_processed, clean_ids)
        return { 'success': True, 'data': { 'done': True } }
    except Exception as e:
        return JSONResponse({ 'success': False, 'error': str(e) }, status_code=500)

@router.post('/clean')
async def pending_clean():
    try:
        from data.pending_store import clean_old_pending
        await asyncio.to_thread(clean_old_pending)
        return { 'success': True, 'data': { 'cleaned': True } }
    except Exception as e:
        return JSONResponse({ 'success': False, 'error': str(e) }, status_code=500)
