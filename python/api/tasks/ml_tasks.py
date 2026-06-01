"""
Tareas ML pesadas — clasificación, upscale, remove bg
"""

from api.celery_app import celery, logger
from celery.exceptions import SoftTimeLimitExceeded

# ─── Intent classify ──────────────────────────────────────────────────────────
@celery.task(
    name        = 'ml.classify_intent',
    max_retries = 2,
    soft_time_limit = 5,
    time_limit  = 8,
)
def classify_intent(text: str, use_transformer: bool = False) -> dict:
    try:
        from ai.intent_classifier import classify
        result = classify(text, use_transformer)
        from dataclasses import asdict
        return asdict(result)
    except SoftTimeLimitExceeded:
        return { 'intent': 'neutral', 'confidence': 0.0, 'method': 'timeout' }
    except Exception as e:
        logger.error(f'classify_intent error: {e}')
        return { 'intent': 'neutral', 'confidence': 0.0, 'method': 'error' }

# ─── Generate AI response ─────────────────────────────────────────────────────
@celery.task(
    name        = 'ml.generate_response',
    max_retries = 1,
    soft_time_limit = 8,
    time_limit  = 12,
)
def generate_ai_response(intent: str, text: str, context: dict, jid: str) -> str:
    try:
        from ai.personality import generate_response
        return generate_response(intent, text=text, context=context, jid=jid, use_humor=True)
    except SoftTimeLimitExceeded:
        return '...'
    except Exception as e:
        logger.error(f'generate_response error: {e}')
        return ''

# ─── Anime upscale ────────────────────────────────────────────────────────────
@celery.task(
    name        = 'ml.anime_upscale',
    max_retries = 1,
    soft_time_limit = 20,
    time_limit  = 28,
    rate_limit  = '5/m',
)
def anime_upscale(image_b64: str, scale: int = 2) -> dict:
    try:
        from ml.anime import anime4k_upscale
        result = anime4k_upscale(image_b64, scale)
        return { 'success': True, 'data': result }
    except SoftTimeLimitExceeded:
        return { 'success': False, 'error': 'timeout' }
    except Exception as e:
        logger.error(f'anime_upscale error: {e}')
        return { 'success': False, 'error': str(e) }

# ─── Remove background ────────────────────────────────────────────────────────
@celery.task(
    name        = 'ml.remove_bg',
    max_retries = 1,
    soft_time_limit = 20,
    time_limit  = 28,
    rate_limit  = '5/m',
)
def remove_background(image_b64: str, bg_color: str = 'transparent') -> dict:
    try:
        from ml.anime import remove_background as _remove_bg
        result = _remove_bg(image_b64, bg_color)
        return { 'success': True, 'data': result }
    except SoftTimeLimitExceeded:
        return { 'success': False, 'error': 'timeout' }
    except Exception as e:
        logger.error(f'remove_bg error: {e}')
        return { 'success': False, 'error': str(e) }

# ─── Spam detection ───────────────────────────────────────────────────────────
@celery.task(
    name        = 'ml.detect_spam',
    max_retries = 0,
    soft_time_limit = 3,
    time_limit  = 5,
)
def detect_spam(text: str) -> dict:
    try:
        from ml.spam_guard import check_message
        result = check_message('__internal__', text)
        return result
    except SoftTimeLimitExceeded:
        return { 'allowed': True, 'reason': 'timeout' }
    except Exception as e:
        return { 'allowed': True, 'reason': 'error' }