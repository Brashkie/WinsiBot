import asyncio
from fastapi import APIRouter
from fastapi.responses import JSONResponse
from pydantic import BaseModel

router = APIRouter()

# Uvicorn corre con --workers 1 (un solo event loop para toda la API) — llamar
# estos modelos/NLP directo dentro de un handler async bloquea ese único hilo
# mientras corre la predicción. analyzeIntent() del bot llama /nlp/intent en
# casi cada mensaje de grupo; sin asyncio.to_thread, una ráfaga de mensajes
# encola TODOS los demás endpoints detrás (confirmado en producción: una
# ráfaga tras reconectar tiró ECONNABORTED en /pending, /users, /messages,
# /fast/process, etc. — no solo en los endpoints de este archivo).

class TextRequest(BaseModel):
    text: str

class IntentRequest(BaseModel):
    text: str

class SimilarityRequest(BaseModel):
    text1: str
    text2: str

class ImageRequest(BaseModel):
    image:    str
    scale:    int = 2
    bg_color: str = 'transparent'
    method:   str = 'nafnet'

@router.post('/predict/spam')
async def predict_spam(req: TextRequest):
    try:
        from ml.spam_guard import check_message
        result = await asyncio.to_thread(check_message, '__predict__', req.text)
        return { 'success': True, 'data': {
            'is_spam':    not result['allowed'],
            'confidence': 0.9 if not result['allowed'] else 0.1,
            'reason':     result['reason'],
        }}
    except Exception as e:
        return JSONResponse({ 'success': False, 'error': str(e) }, status_code=500)

@router.post('/predict/intent')
async def predict_intent(req: IntentRequest):
    try:
        from ml.models import get_intent_model
        result = await asyncio.to_thread(lambda: get_intent_model().predict(req.text))
        return { 'success': True, 'data': result }
    except Exception as e:
        return JSONResponse({ 'success': False, 'error': str(e) }, status_code=500)

@router.post('/predict/sentiment')
async def predict_sentiment(req: TextRequest):
    try:
        from ml.models import get_sentiment_model
        result = await asyncio.to_thread(lambda: get_sentiment_model().predict(req.text))
        return { 'success': True, 'data': result }
    except Exception as e:
        return JSONResponse({ 'success': False, 'error': str(e) }, status_code=500)

@router.post('/nlp/analyze')
async def nlp_analyze(req: TextRequest):
    try:
        from ml.nlp import analyze_text
        result = await asyncio.to_thread(analyze_text, req.text)
        return { 'success': True, 'data': result }
    except Exception as e:
        return JSONResponse({ 'success': False, 'error': str(e) }, status_code=500)

@router.post('/nlp/intent')
async def nlp_intent(req: TextRequest):
    try:
        from ml.nlp import extract_intent
        result = await asyncio.to_thread(extract_intent, req.text)
        return { 'success': True, 'data': result }
    except Exception as e:
        return JSONResponse({ 'success': False, 'error': str(e) }, status_code=500)

@router.post('/nlp/similarity')
async def nlp_similarity(req: SimilarityRequest):
    try:
        from ml.nlp import text_similarity
        result = await asyncio.to_thread(text_similarity, req.text1, req.text2)
        return { 'success': True, 'data': { 'similarity': result } }
    except Exception as e:
        return JSONResponse({ 'success': False, 'error': str(e) }, status_code=500)

@router.post('/nlp/entities')
async def nlp_entities(req: TextRequest):
    try:
        from ml.nlp import extract_entities
        result = await asyncio.to_thread(extract_entities, req.text)
        return { 'success': True, 'data': result }
    except Exception as e:
        return JSONResponse({ 'success': False, 'error': str(e) }, status_code=500)

@router.post('/train')
async def train_models():
    try:
        from ml.train import train_all
        # Entrenamiento puede tardar segundos/minutos — con más razón no
        # puede correr en el event loop principal.
        result = await asyncio.to_thread(train_all, verbose=False)
        return { 'success': True, 'data': result }
    except Exception as e:
        return JSONResponse({ 'success': False, 'error': str(e) }, status_code=500)