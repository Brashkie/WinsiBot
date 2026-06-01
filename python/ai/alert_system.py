"""
WinsiBot — Alert System
Alertas visuales en consola + log persistente
"""

import json
import time
import threading
import winsound
from pathlib import Path
from datetime import datetime, timedelta
from dataclasses import dataclass, asdict, field
from typing import Optional
from collections import defaultdict
from rich.console import Console
from rich.panel import Panel
from rich.text import Text

console   = Console()
ROOT_DIR  = Path(__file__).parent.parent.parent
DATA_DIR  = ROOT_DIR / 'data'
ALERT_LOG = DATA_DIR / 'alert_log.json'

# ─── Config ───────────────────────────────────────────────────────────────────
MAX_ALERTS_DISK   = 500
COOLDOWN_S        = 60     # misma alerta no repite antes de 60s
CRITICAL_COOLDOWN = 30     # críticos repiten cada 30s hasta resolver

# ─── Tipos ────────────────────────────────────────────────────────────────────
@dataclass
class Alert:
    id:         str
    level:      str        # critical | high | medium | low
    source:     str        # health | break | watchdog | manual
    title:      str
    message:    str
    timestamp:  str
    resolved:   bool  = False
    count:      int   = 1
    last_seen:  str   = ''

    def __post_init__(self):
        if not self.last_seen:
            self.last_seen = self.timestamp

@dataclass
class AlertReport:
    timestamp:  str
    total:      int
    critical:   int
    alerts:     list = field(default_factory=list)

# ─── Estado en RAM ────────────────────────────────────────────────────────────
_alerts_cache:  list[Alert]          = []
_cache_loaded:  bool                 = False
_cooldowns:     dict[str, float]     = {}   # alert_id → last_sent ts
_flush_lock:    threading.Lock       = threading.Lock()
_last_flush:    float                = 0.0
FLUSH_CD        = 5  # segundos entre writes

# ─── Niveles ──────────────────────────────────────────────────────────────────
LEVEL_CONFIG = {
    'critical': {
        'color':   'bold red',
        'bg':      'red',
        'icon':    '✗',
        'border':  'red',
        'beeps':   3,
        'cooldown': CRITICAL_COOLDOWN,
    },
    'high': {
        'color':   'bold yellow',
        'bg':      'yellow',
        'icon':    '§',
        'border':  'yellow',
        'beeps':   2,
        'cooldown': COOLDOWN_S,
    },
    'medium': {
        'color':   'bold cyan',
        'bg':      'cyan',
        'icon':    '◆',
        'border':  'cyan',
        'beeps':   1,
        'cooldown': COOLDOWN_S * 2,
    },
    'low': {
        'color':   'dim',
        'bg':      'white',
        'icon':    '·',
        'border':  'white',
        'beeps':   0,
        'cooldown': COOLDOWN_S * 5,
    },
}

# ─── Cache helpers ────────────────────────────────────────────────────────────
def _load_cache() -> list[Alert]:
    global _alerts_cache, _cache_loaded
    if _cache_loaded:
        return _alerts_cache
    if not ALERT_LOG.exists():
        _alerts_cache = []
        _cache_loaded = True
        return _alerts_cache
    try:
        raw = json.loads(ALERT_LOG.read_text())
        _alerts_cache = [Alert(**a) for a in raw]
    except Exception:
        _alerts_cache = []
    _cache_loaded = True
    return _alerts_cache

def _flush(force: bool = False) -> None:
    global _last_flush
    with _flush_lock:
        now = time.time()
        if not force and (now - _last_flush) < FLUSH_CD:
            return
        try:
            DATA_DIR.mkdir(parents=True, exist_ok=True)
            data = [asdict(a) for a in _alerts_cache[-MAX_ALERTS_DISK:]]
            ALERT_LOG.write_text(json.dumps(data, indent=2))
            _last_flush = now
        except Exception as e:
            console.print(f'  [red]✗ AlertSystem flush error: {e}[/red]')

def _alert_id(source: str, title: str) -> str:
    import hashlib
    return hashlib.md5(f'{source}:{title}'.encode()).hexdigest()[:12]

# ─── Cooldown ─────────────────────────────────────────────────────────────────
def _is_in_cooldown(alert_id: str, level: str) -> bool:
    last = _cooldowns.get(alert_id, 0)
    cd   = LEVEL_CONFIG.get(level, {}).get('cooldown', COOLDOWN_S)
    return (time.time() - last) < cd

def _set_cooldown(alert_id: str) -> None:
    _cooldowns[alert_id] = time.time()

# ─── Sonido ───────────────────────────────────────────────────────────────────
def _beep(level: str) -> None:
    pass
    #beeps = LEVEL_CONFIG.get(level, {}).get('beeps', 0)
    #if beeps == 0:
        #return
    #try:
        #patterns = {
            #3: [(1000, 200), (800, 200), (600, 400)],   # crítico — descendente urgente
            #2: [(900, 200), (900, 300)],                  # alto — doble
            #1: [(750, 250)],                              # medio — simple
        #}
        #for freq, dur in patterns.get(beeps, [(750, 250)]):
            #winsound.Beep(freq, dur)
            #time.sleep(0.05)
    #except Exception:
        #pass  # winsound puede fallar en algunos entornos

# ─── Visual en consola ────────────────────────────────────────────────────────
def _print_alert(alert: Alert) -> None:
    cfg   = LEVEL_CONFIG.get(alert.level, LEVEL_CONFIG['low'])
    icon  = cfg['icon']
    color = cfg['color']
    now   = datetime.now().strftime('%H:%M:%S')

    # crítico y alto — panel llamativo
    if alert.level in ('critical', 'high'):
        repeat = f' (x{alert.count})' if alert.count > 1 else ''
        title_text = Text()
        title_text.append(f' {icon} ', style=f'bold {cfg["border"]}')
        title_text.append(f'{alert.title}{repeat}', style=f'bold white')
        title_text.append(f'  {now}', style='dim white')

        body = Text()
        body.append(alert.message, style='white')
        body.append(f'\n[{alert.source.upper()}]', style='dim')

        console.print(Panel(
            body,
            title      = title_text,
            border_style = cfg['border'],
            padding    = (0, 2),
        ))
    else:
        # medium y low — línea simple
        console.print(f'  [{color}]{icon} [{alert.level.upper()}] {alert.title} — {alert.message}[/{color}]')

# ─── Core: enviar alerta ──────────────────────────────────────────────────────
def send_alert(
    title:   str,
    message: str,
    level:   str  = 'medium',
    source:  str  = 'manual',
) -> Optional[Alert]:
    """
    Envía una alerta a consola + log.
    Respeta cooldowns — no spamea.
    """
    alerts = _load_cache()
    aid    = _alert_id(source, title)
    now    = datetime.utcnow().isoformat()

    # buscar existente activo
    existing = next((a for a in alerts if a.id == aid and not a.resolved), None)

    if existing:
        existing.count    += 1
        existing.last_seen = now
        if _is_in_cooldown(aid, level):
            _flush()
            return None   # en cooldown — guardar count pero no mostrar
        existing.level   = level  # puede escalar
        existing.message = message
    else:
        existing = Alert(
            id        = aid,
            level     = level,
            source    = source,
            title     = title,
            message   = message,
            timestamp = now,
        )
        alerts.append(existing)

    # mostrar + sonido
    _print_alert(existing)
    _beep(level)
    _set_cooldown(aid)
    _flush()
    return existing

def resolve_alert(title: str, source: str = 'manual') -> bool:
    """Marca una alerta como resuelta"""
    aid    = _alert_id(source, title)
    alerts = _load_cache()
    for a in alerts:
        if a.id == aid and not a.resolved:
            a.resolved = True
            _flush(force=True)
            return True
    return False

# ─── Integraciones ────────────────────────────────────────────────────────────
def alert_from_health(report) -> None:
    if not hasattr(report, 'checks'):
        return

    HEALTH_LEVELS = {
        'session':     'critical',
        'node':        'critical',
        'flask':       'critical',
        'freeze':      'critical',
        'latency':     'high',
        'mem_leak':    'high',
        'ram':         'high',
        'instability': 'medium',
        'error_rate':  'medium',
        'cpu':         'medium',
        'disk':        'low',
        'data':        'low',
    }

    for check in report.checks:
        name   = check.get('name', '')
        status = check.get('status', 'ok')
        msg    = check.get('message', '')

        if status == 'ok':
            resolve_alert(f'health:{name}', source='health')
            continue

        level = HEALTH_LEVELS.get(name, 'medium')
        if status == 'warn' and level == 'critical':
            level = 'high'

        aid = _alert_id('health', f'health:{name}')

        # ← si ya existe activa — solo actualizar count, NO mostrar de nuevo
        alerts  = _load_cache()
        existing = next((a for a in alerts if a.id == aid and not a.resolved), None)
        if existing:
            existing.count    += 1
            existing.last_seen = datetime.utcnow().isoformat()
            existing.message   = msg
            _flush()
            continue  # ← no mostrar, ya se mostró antes

        # nueva alerta — mostrar una sola vez
        send_alert(
            title   = f'health:{name}',
            message = msg,
            level   = level,
            source  = 'health',
        )

def alert_from_break(break_event) -> None:
    """
    Procesa un BreakEvent y dispara alerta.
    Llama desde break_detector cuando detecta rotura nueva.
    """
    SEV_TO_LEVEL = {
        'critical': 'critical',
        'high':     'high',
        'medium':   'medium',
        'low':      'low',
    }
    level = SEV_TO_LEVEL.get(break_event.severity, 'medium')
    send_alert(
        title   = f'break:{break_event.type}',
        message = f'{break_event.message} → {break_event.suggested_fix}',
        level   = level,
        source  = 'break',
    )

def alert_from_watchdog(event: str, detail: str = '') -> None:
    """
    Alerta desde monitor.py — crashes, hangs, reinicios.
    """
    WATCHDOG_ALERTS = {
        'hang_restart':        ('critical', 'Node colgado — forzando reinicio'),
        'no_response_restart': ('high',     'Comando sin respuesta — reiniciando'),
        'crash_restart':       ('high',     'Node crasheó — reiniciando'),
        'expelled_440':        ('critical', 'Sesión expulsada (440) — cerrar WhatsApp Web'),
        'max_restarts':        ('critical', 'Máximo de reinicios alcanzado — bot detenido'),
        'clean_exit':          ('low',      'Bot detenido limpiamente'),
        'shutdown':            ('low',      'Bot apagado manualmente'),
    }
    cfg     = WATCHDOG_ALERTS.get(event)
    if not cfg:
        return
    level, title = cfg
    send_alert(
        title   = title,
        message = detail or title,
        level   = level,
        source  = 'watchdog',
    )

# ─── Reporte ──────────────────────────────────────────────────────────────────
def get_report() -> AlertReport:
    alerts  = _load_cache()
    active  = [a for a in alerts if not a.resolved]
    return AlertReport(
        timestamp = datetime.utcnow().isoformat(),
        total     = len(active),
        critical  = sum(1 for a in active if a.level == 'critical'),
        alerts    = [asdict(a) for a in active],
    )

def print_summary() -> None:
    report = get_report()
    if not report.total:
        console.print('  [green]✔ Alert System — sin alertas activas[/green]')
        return
    console.print(f'\n  [red]◆ Alert System — {report.total} activa(s) · {report.critical} crítica(s)[/red]')
    for a in report.alerts:
        cfg   = LEVEL_CONFIG.get(a['level'], LEVEL_CONFIG['low'])
        console.print(f'  [{cfg["color"]}]{cfg["icon"]} {a["title"]} — {a["message"]}[/{cfg["color"]}]')
    console.print()