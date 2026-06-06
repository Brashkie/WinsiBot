from fastapi import APIRouter
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import Optional

router = APIRouter()

class IntentRequest(BaseModel):
    text:            str
    use_transformer: bool = False

class LearnRequest(BaseModel):
    text:   str
    intent: str

class MemoryUpdateRequest(BaseModel):
    text:   str
    intent: str  = 'neutral'
    is_cmd: bool = False

class PersonalityRequest(BaseModel):
    intent:     str             = 'neutral'
    text:       str             = ''
    context:    dict            = {}
    jid:        str             = ''
    use_humor:  bool            = False
    history:    list            = []
    user_style: Optional[dict]  = None

class ModeRequest(BaseModel):
    mode: str
    jid:  Optional[str] = None

class BrainLearnRequest(BaseModel):
    text:     str
    category: str

# ─── Brain ────────────────────────────────────────────────────────────────────
@router.get('/brain/summary')
async def brain_summary():
    try:
        from ai.ai_brain import get_brain
        return { 'success': True, 'data': get_brain().get_summary() }
    except Exception as e:
        return JSONResponse({ 'success': False, 'error': str(e) }, status_code=500)

@router.post('/brain/classify')
async def brain_classify(req: IntentRequest):
    try:
        from ai.ai_brain import get_brain
        return { 'success': True, 'data': get_brain().classify_log(req.text) }
    except Exception as e:
        return JSONResponse({ 'success': False, 'error': str(e) }, status_code=500)

@router.post('/brain/learn')
async def brain_learn(req: BrainLearnRequest):
    try:
        from ai.ai_brain import get_brain
        get_brain().learn_from_log(req.text, req.category)
        return { 'success': True }
    except Exception as e:
        return JSONResponse({ 'success': False, 'error': str(e) }, status_code=500)

# ─── Intent ───────────────────────────────────────────────────────────────────
@router.post('/intent/classify')
async def intent_classify(req: IntentRequest):
    try:
        from ai.intent_classifier import classify
        from dataclasses import asdict
        result = classify(req.text, req.use_transformer)
        return { 'success': True, 'data': asdict(result) }
    except Exception as e:
        return JSONResponse({ 'success': False, 'error': str(e) }, status_code=500)

@router.post('/intent/learn')
async def intent_learn(req: LearnRequest):
    try:
        from ai.intent_classifier import learn
        learn(req.text, req.intent)
        return { 'success': True }
    except Exception as e:
        return JSONResponse({ 'success': False, 'error': str(e) }, status_code=500)

@router.get('/intent/stats')
async def intent_stats():
    try:
        from ai.intent_classifier import get_classifier
        return { 'success': True, 'data': get_classifier().get_stats() }
    except Exception as e:
        return JSONResponse({ 'success': False, 'error': str(e) }, status_code=500)

# ─── Memory ───────────────────────────────────────────────────────────────────
@router.get('/memory/toxic')
async def memory_toxic():
    try:
        from ai.user_memory import get_toxic_users
        return { 'success': True, 'data': get_toxic_users() }
    except Exception as e:
        return JSONResponse({ 'success': False, 'error': str(e) }, status_code=500)

@router.get('/memory/{sender}')
async def memory_get(sender: str):
    try:
        from ai.user_memory import get_context, get_summary
        return { 'success': True, 'data': {
            'context': get_context(sender),
            'summary': get_summary(sender),
        }}
    except Exception as e:
        return JSONResponse({ 'success': False, 'error': str(e) }, status_code=500)

@router.post('/memory/{sender}/update')
async def memory_update(sender: str, req: MemoryUpdateRequest):
    try:
        from ai.user_memory import update
        from dataclasses import asdict
        profile = update(sender, req.text, req.intent, req.is_cmd)
        return { 'success': True, 'data': asdict(profile) }
    except Exception as e:
        return JSONResponse({ 'success': False, 'error': str(e) }, status_code=500)

# ─── Personality ──────────────────────────────────────────────────────────────
@router.post('/personality/respond')
async def personality_respond(req: PersonalityRequest):
    try:
        from ai.personality import generate_response
        result = generate_response(
            req.intent, req.text, req.context, req.jid, req.use_humor,
            req.history, req.user_style,
        )
        return { 'success': True, 'data': result }
    except Exception as e:
        return JSONResponse({ 'success': False, 'error': str(e) }, status_code=500)

@router.get('/personality/mode')
async def personality_mode_get():
    try:
        from ai.personality import get_engine
        engine = get_engine()
        return { 'success': True, 'data': {
            'current':     engine.get_mode(),
            'modes':       engine.list_modes(),
            'group_modes': engine.get_group_modes(),
        }}
    except Exception as e:
        return JSONResponse({ 'success': False, 'error': str(e) }, status_code=500)

@router.post('/personality/mode')
async def personality_mode_set(req: ModeRequest):
    try:
        from ai.personality import get_engine
        ok = get_engine().set_mode(req.mode, req.jid)
        return { 'success': ok }
    except Exception as e:
        return JSONResponse({ 'success': False, 'error': str(e) }, status_code=500)

@router.post('/personality/reset')
async def personality_reset(req: ModeRequest):
    try:
        from ai.personality import get_engine
        get_engine().reset_mode(req.jid)
        return { 'success': True }
    except Exception as e:
        return JSONResponse({ 'success': False, 'error': str(e) }, status_code=500)