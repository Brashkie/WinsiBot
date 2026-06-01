from fastapi import APIRouter
from fastapi.responses import JSONResponse
from pydantic import BaseModel

router = APIRouter()

class IntentTaskRequest(BaseModel):
    text:            str  = ''
    use_transformer: bool = False

class RespondTaskRequest(BaseModel):
    intent:  str  = 'neutral'
    text:    str  = ''
    context: dict = {}
    jid:     str  = ''

class UpscaleTaskRequest(BaseModel):
    image: str
    scale: int = 2

@router.post('/intent')
async def task_intent(req: IntentTaskRequest):
    try:
        from api.tasks.ml_tasks import classify_intent
        result = classify_intent.apply_async(args=(req.text, req.use_transformer), expires=10)
        return { 'success': True, 'data': result.get(timeout=8) }
    except Exception as e:
        return JSONResponse({ 'success': False, 'error': str(e) }, status_code=500)

@router.post('/respond')
async def task_respond(req: RespondTaskRequest):
    try:
        from api.tasks.ml_tasks import generate_ai_response
        result = generate_ai_response.apply_async(
            args=(req.intent, req.text, req.context, req.jid), expires=15
        )
        return { 'success': True, 'data': result.get(timeout=12) }
    except Exception as e:
        return JSONResponse({ 'success': False, 'error': str(e) }, status_code=500)

@router.post('/upscale')
async def task_upscale(req: UpscaleTaskRequest):
    try:
        from api.tasks.ml_tasks import anime_upscale
        result = anime_upscale.apply_async(args=(req.image, req.scale), expires=30)
        return { 'success': True, 'data': result.get(timeout=28) }
    except Exception as e:
        return JSONResponse({ 'success': False, 'error': str(e) }, status_code=500)