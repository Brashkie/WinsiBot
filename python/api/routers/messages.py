import asyncio
from fastapi import APIRouter
from fastapi.responses import JSONResponse
from pydantic import BaseModel

router = APIRouter()

class MessageRequest(BaseModel):
    id:       str  = ''
    jid:      str  = ''
    sender:   str  = ''
    pushName: str  = ''
    text:     str  = ''
    command:  str  = ''
    isGroup:  bool = False
    isOwner:  bool = False

@router.post('')
async def log_message(req: MessageRequest):
    try:
        from data.parquet_store import append_message
        await asyncio.to_thread(append_message, req.dict())
        return { 'success': True, 'data': { 'saved': True } }
    except Exception as e:
        return JSONResponse({ 'success': False, 'error': str(e) }, status_code=500)
