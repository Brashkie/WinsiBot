import asyncio
from fastapi import APIRouter
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import Optional

router = APIRouter()

class UpsertUserRequest(BaseModel):
    jid:       str
    pushName:  str  = ''
    isOwner:   bool = False
    addExp:    bool = False
    expAmount: int  = 10

class UpdateUserRequest(BaseModel):
    exp:        Optional[int]  = None
    level:      Optional[int]  = None
    money:      Optional[int]  = None
    diamonds:   Optional[int]  = None
    premium:    Optional[bool] = None
    banned:     Optional[bool] = None
    ban_reason: Optional[str]  = None
    registered: Optional[bool] = None

@router.get('/{sender}')
async def get_user(sender: str):
    try:
        from data.database import get_user as _get
        data = await asyncio.to_thread(_get, sender)
        return { 'success': True, 'data': data }
    except Exception as e:
        return JSONResponse({ 'success': False, 'error': str(e) }, status_code=500)

@router.patch('/{sender}')
async def update_user(sender: str, req: UpdateUserRequest):
    try:
        from data.database import update_user as _update
        data = {k: v for k, v in req.dict().items() if v is not None}
        await asyncio.to_thread(lambda: _update(sender, **data))
        return { 'success': True }
    except Exception as e:
        return JSONResponse({ 'success': False, 'error': str(e) }, status_code=500)

@router.post('')
async def upsert_user(req: UpsertUserRequest):
    try:
        from data.parquet_store import get_or_create_user, add_exp
        user = await asyncio.to_thread(get_or_create_user, req.jid, req.pushName, req.isOwner)
        if req.addExp:
            user = await asyncio.to_thread(add_exp, req.jid, req.expAmount)
        return { 'success': True, 'data': user }
    except Exception as e:
        return JSONResponse({ 'success': False, 'error': str(e) }, status_code=500)

@router.post('/{jid}/warn')
async def warn_user(jid: str):
    try:
        from data.parquet_store import add_warn
        warns = await asyncio.to_thread(add_warn, jid)
        return { 'success': True, 'data': { 'jid': jid, 'warns': warns } }
    except Exception as e:
        return JSONResponse({ 'success': False, 'error': str(e) }, status_code=500)

@router.post('/{jid}/ban')
async def ban_user(jid: str):
    try:
        from data.parquet_store import get_or_create_user, upsert_user
        def _ban():
            user = get_or_create_user(jid)
            user['banned'] = True
            upsert_user(user)
        await asyncio.to_thread(_ban)
        return { 'success': True, 'data': { 'jid': jid, 'banned': True } }
    except Exception as e:
        return JSONResponse({ 'success': False, 'error': str(e) }, status_code=500)

@router.post('/{jid}/unban')
async def unban_user(jid: str):
    try:
        from data.parquet_store import get_or_create_user, upsert_user
        def _unban():
            user = get_or_create_user(jid)
            user['banned'] = False
            upsert_user(user)
        await asyncio.to_thread(_unban)
        return { 'success': True, 'data': { 'jid': jid, 'banned': False } }
    except Exception as e:
        return JSONResponse({ 'success': False, 'error': str(e) }, status_code=500)

@router.get('')
async def get_all_users():
    try:
        from data.parquet_store import load_all_users
        df = await asyncio.to_thread(load_all_users)
        return { 'success': True, 'data': df.to_dicts() }
    except Exception as e:
        return JSONResponse({ 'success': False, 'error': str(e) }, status_code=500)
