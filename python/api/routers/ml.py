from fastapi import APIRouter
from fastapi.responses import JSONResponse
from pydantic import BaseModel

router = APIRouter()

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
        result = check_message('__predict__', req.text)
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
        return { 'success': True, 'data': get_intent_model().predict(req.text) }
    except Exception as e:
        return JSONResponse({ 'success': False, 'error': str(e) }, status_code=500)

@router.post('/predict/sentiment')
async def predict_sentiment(req: TextRequest):
    try:
        from ml.models import get_sentiment_model
        return { 'success': True, 'data': get_sentiment_model().predict(req.text) }
    except Exception as e:
        return JSONResponse({ 'success': False, 'error': str(e) }, status_code=500)

@router.post('/nlp/analyze')
async def nlp_analyze(req: TextRequest):
    try:
        from ml.nlp import analyze_text
        return { 'success': True, 'data': analyze_text(req.text) }
    except Exception as e:
        return JSONResponse({ 'success': False, 'error': str(e) }, status_code=500)

@router.post('/nlp/intent')
async def nlp_intent(req: TextRequest):
    try:
        from ml.nlp import extract_intent
        return { 'success': True, 'data': extract_intent(req.text) }
    except Exception as e:
        return JSONResponse({ 'success': False, 'error': str(e) }, status_code=500)

@router.post('/nlp/similarity')
async def nlp_similarity(req: SimilarityRequest):
    try:
        from ml.nlp import text_similarity
        return { 'success': True, 'data': { 'similarity': text_similarity(req.text1, req.text2) } }
    except Exception as e:
        return JSONResponse({ 'success': False, 'error': str(e) }, status_code=500)

@router.post('/nlp/entities')
async def nlp_entities(req: TextRequest):
    try:
        from ml.nlp import extract_entities
        return { 'success': True, 'data': extract_entities(req.text) }
    except Exception as e:
        return JSONResponse({ 'success': False, 'error': str(e) }, status_code=500)

@router.post('/train')
async def train_models():
    try:
        from ml.train import train_all
        return { 'success': True, 'data': train_all(verbose=False) }
    except Exception as e:
        return JSONResponse({ 'success': False, 'error': str(e) }, status_code=500)