"""
Tareas de media — stickers, descargas, conversiones
"""

from api.celery_app import celery, logger
from celery.exceptions import SoftTimeLimitExceeded

@celery.task(
    name        = 'media.search_image',
    max_retries = 2,
    soft_time_limit = 15,
    time_limit  = 20,
    rate_limit  = '10/m',
)
def search_image(query: str) -> dict:
    try:
        from ml.search import search_and_download
        result = search_and_download(query)
        return { 'success': True, 'data': result }
    except SoftTimeLimitExceeded:
        return { 'success': False, 'error': 'timeout' }
    except Exception as e:
        logger.error(f'search_image error: {e}')
        return { 'success': False, 'error': str(e) }

@celery.task(
    name        = 'media.download_tiktok',
    max_retries = 2,
    soft_time_limit = 25,
    time_limit  = 30,
    rate_limit  = '5/m',
)
def download_tiktok(url: str) -> dict:
    try:
        import yt_dlp
        ydl_opts = {
            'format':    'mp4',
            'quiet':     True,
            'no_warnings': True,
        }
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            return { 'success': True, 'url': info.get('url'), 'title': info.get('title') }
    except SoftTimeLimitExceeded:
        return { 'success': False, 'error': 'timeout' }
    except Exception as e:
        return { 'success': False, 'error': str(e) }