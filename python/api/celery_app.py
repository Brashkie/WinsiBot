"""
WinsiBot — Celery
Worker para tareas pesadas y timeouts automáticos
"""

from celery import Celery
from celery.utils.log import get_task_logger
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).parent.parent))

REDIS_URL = 'redis://localhost:6379/0'

celery = Celery(
    'winsibot',
    broker        = REDIS_URL,
    backend       = REDIS_URL,
    include       = [
        'api.tasks.ml_tasks',
        'api.tasks.media_tasks',
        'api.tasks.scraper_tasks',
    ],
)

celery.conf.update(
    # serialización
    task_serializer         = 'json',
    result_serializer       = 'json',
    accept_content          = ['json'],
    # timeouts
    task_soft_time_limit    = 25,    # warning a los 25s
    task_time_limit         = 30,    # kill a los 30s
    # resultados
    result_expires          = 3600,  # 1 hora
    # reintentos
    task_acks_late          = True,
    task_reject_on_worker_lost = True,
    # concurrencia
    worker_concurrency      = 2,
    worker_prefetch_multiplier = 1,
    # rate limit global
    task_default_rate_limit = '30/m',
)

logger = get_task_logger(__name__)