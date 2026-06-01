"""
Tareas de scraping — búsquedas, APIs externas
"""

from api.celery_app import celery, logger
from celery.exceptions import SoftTimeLimitExceeded

@celery.task(
    name        = 'scraper.fetch_url',
    max_retries = 2,
    soft_time_limit = 10,
    time_limit  = 15,
)
def fetch_url(url: str, headers: dict = {}) -> dict:
    try:
        import httpx
        with httpx.Client(timeout=8, follow_redirects=True) as client:
            r = client.get(url, headers=headers)
            return { 'success': True, 'status': r.status_code, 'text': r.text[:50000] }
    except SoftTimeLimitExceeded:
        return { 'success': False, 'error': 'timeout' }
    except Exception as e:
        return { 'success': False, 'error': str(e) }