import asyncio
from fastapi import APIRouter
from fastapi.responses import JSONResponse
from pydantic import BaseModel

router = APIRouter()

# Quedan los DOS endpoints que el bot llama de verdad. Los otros seis
# (/predict/intent, /predict/sentiment, /nlp/analyze, /nlp/similarity,
# /nlp/entities y /train) no tenían un solo llamador, y con ellos se fueron
# ml/models.py y ml/train.py — que eran los únicos que usaban `polars`, más el
# dataset messages.parquet, que además ya no se alimentaba desde que los
# contadores del bot pasaron a Rust: reentrenar habría usado datos congelados.
#
# Uvicorn corre con --workers 1 (un solo event loop para toda la API) — llamar
# estos modelos/NLP directo dentro de un handler async bloquea ese único hilo
# mientras corre la predicción. analyzeIntent() del bot llama /nlp/intent en
# casi cada mensaje de grupo; sin asyncio.to_thread, una ráfaga de mensajes
# encola TODOS los demás endpoints detrás (confirmado en producción).

class TextRequest(BaseModel):
    text: str

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

@router.post('/nlp/intent')
async def nlp_intent(req: TextRequest):
    try:
        from ml.nlp import extract_intent
        result = await asyncio.to_thread(extract_intent, req.text)
        return { 'success': True, 'data': result }
    except Exception as e:
        return JSONResponse({ 'success': False, 'error': str(e) }, status_code=500)
