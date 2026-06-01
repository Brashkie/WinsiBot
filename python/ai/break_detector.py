"""
WinsiBot — Break Detector v2
Detección inteligente de roturas con agrupación, priorización y sugerencias contextuales
"""

import json
import time
import re
import hashlib
import threading
from pathlib import Path
from datetime import datetime, timedelta
from dataclasses import dataclass, asdict, field
from typing import Optional
from collections import defaultdict
from rich.console import Console

console  = Console()
ROOT_DIR = Path(__file__).parent.parent.parent
DATA_DIR = ROOT_DIR / 'data'
BREAK_LOG = DATA_DIR / 'break_log.json'

# ─── Config ───────────────────────────────────────────────────────────────────
MAX_BREAKS_DISK    = 200       # máximo registros en disco
DEDUP_WINDOW_S     = 300       # 5min — no guardar mismo error dos veces
AUTO_RESOLVE_H     = 24        # auto-resolver breaks viejos sin reincidencia
SIMILARITY_THRESH  = 0.6       # umbral para agrupar errores similares
FLUSH_COOLDOWN_S   = 10        # mínimo entre escrituras a disco

# ─── Tipos ────────────────────────────────────────────────────────────────────
@dataclass
class BreakEvent:
    id:            str
    type:          str           # baileys | api | lib | node | unknown
    severity:      str           # critical | high | medium | low
    message:       str
    pattern:       str
    first_seen:    str
    last_seen:     str
    count:         int  = 1
    resolved:      bool = False
    suggested_fix: str  = ''
    context:       str  = ''     # líneas alrededor del error
    group_id:      str  = ''     # agrupa errores similares
    frequency:     float = 0.0   # errores por hora

@dataclass
class BreakReport:
    timestamp:  str
    total:      int
    critical:   int
    new_breaks: list = field(default_factory=list)
    active:     list = field(default_factory=list)
    resolved:   list = field(default_factory=list)
    groups:     dict = field(default_factory=dict)   # group_id → [breaks]

# ─── Patrones Baileys ─────────────────────────────────────────────────────────
BAILEYS_PATTERNS = [
    {
        'pattern':  r'Connection Closed',
        'type':     'baileys',
        'severity': 'high',
        'message':  'Baileys perdió conexión con WhatsApp',
        'fix_base': 'Reconexión automática activa',
        'fix_ctx':  {
            'count_gt_5':  'Más de 5 desconexiones — posible ban temporal · esperar 30min',
            'count_gt_10': 'Más de 10 desconexiones — verificar si cuenta fue baneada',
            'after_update':'Ocurrió tras actualización de Baileys — puede ser incompatibilidad',
            'with_timeout':'Junto a ETIMEDOUT — problema de red, no de Baileys',
        },
    },
    {
        'pattern':  r'Stream Errored',
        'type':     'baileys',
        'severity': 'high',
        'message':  'Stream de Baileys con error',
        'fix_base': 'Reiniciar bot · suele resolverse solo',
        'fix_ctx':  {
            'count_gt_3':  'Recurrente — revisar estabilidad de red',
            'high_freq':   'Alta frecuencia — posible throttling de WhatsApp',
        },
    },
    {
        'pattern':  r'([A-Za-z]+) is not a function',
        'type':     'baileys',
        'severity': 'critical',
        'message':  'API de Baileys cambió — método inexistente',
        'fix_base': 'Revisar changelog de @whiskeysockets/baileys',
        'fix_ctx':  {
            'has_match':   'Método afectado: {match_1} · buscar reemplazo en types/Socket.d.ts',
            'after_update':'Actualización reciente de Baileys causó breaking change',
        },
    },
    {
        'pattern':  r'Cannot read propert(?:y|ies) of (undefined|null)',
        'type':     'baileys',
        'severity': 'critical',
        'message':  'Estructura de datos de Baileys cambió',
        'fix_base': 'Agregar null checks · revisar versión de Baileys',
        'fix_ctx':  {
            'in_handler':  'Error en handler.ts — agregar optional chaining (?.) en contexto',
            'in_command':  'Error en comando — el mensaje no tiene la estructura esperada',
            'count_gt_1':  'Recurrente — Baileys cambió estructura · revisar tipos',
        },
    },
    {
        'pattern':  r'invalid proto(?:col)?buf|proto.*mismatch',
        'type':     'baileys',
        'severity': 'critical',
        'message':  'Proto de WhatsApp cambió — Baileys desactualizado',
        'fix_base': 'npm update @whiskeysockets/baileys',
        'fix_ctx':  {
            'default':     'WhatsApp desplegó actualización · esperar fix oficial de Baileys (1-3 días)',
        },
    },
    {
        'pattern':  r'Precondition Required|statusCode.*428',
        'type':     'baileys',
        'severity': 'high',
        'message':  'WhatsApp rechaza mensajes — sesión en mal estado',
        'fix_base': 'Verificar sesión · puede requerir nuevo QR',
        'fix_ctx':  {
            'count_gt_3':  'Múltiples rechazos — sesión corrupta · borrar auth/ y escanear QR',
            'with_closed': 'Junto a Connection Closed — sesión expirada',
        },
    },
    {
        'pattern':  r'rate-overlimit|429|Too Many Requests',
        'type':     'baileys',
        'severity': 'medium',
        'message':  'Rate limit de WhatsApp alcanzado',
        'fix_base': 'Reducir velocidad de envíos · agregar delays',
        'fix_ctx':  {
            'high_freq':   'Frecuencia muy alta — revisar comandos que envían en bucle',
            'in_group':    'En grupo — reducir broadcasts masivos',
        },
    },
    {
        'pattern':  r'logged out|Logged Out|logout',
        'type':     'baileys',
        'severity': 'critical',
        'message':  'Sesión cerrada por WhatsApp',
        'fix_base': 'Escanear QR nuevamente',
        'fix_ctx':  {
            'default':     'Si ocurre seguido — verificar si número fue baneado',
        },
    },
]

# ─── Patrones API/Libs ────────────────────────────────────────────────────────
API_PATTERNS = [
    {
        'pattern':  r'ECONNREFUSED.*5000|Flask.*no responde|connect.*5000.*refused',
        'type':     'api',
        'severity': 'critical',
        'message':  'Flask API caído',
        'fix_base': 'python api/app.py',
        'fix_ctx':  {
            'count_gt_3':  'Caídas frecuentes — revisar si Flask tiene errores al iniciar',
            'after_start': 'Al arrancar — verificar puerto 5000 libre: netstat -an | findstr 5000',
        },
    },
    {
        'pattern':  r'ECONNREFUSED.*8080',
        'type':     'api',
        'severity': 'medium',
        'message':  'PHP panel caído',
        'fix_base': 'Reiniciar PHP panel — no crítico',
        'fix_ctx':  {},
    },
    {
        'pattern':  r"ModuleNotFoundError: No module named '(.+?)'",
        'type':     'lib',
        'severity': 'critical',
        'message':  'Módulo Python faltante',
        'fix_base': 'pip install {match_1} --break-system-packages',
        'fix_ctx':  {
            'has_match':   'pip install {match_1} --break-system-packages',
            'after_update':'Dependencia nueva tras actualización — revisar requirements.txt',
        },
    },
    {
        'pattern':  r"Cannot find module ['\"](.+?)['\"]",
        'type':     'lib',
        'severity': 'critical',
        'message':  'Módulo Node.js faltante',
        'fix_base': 'npm install',
        'fix_ctx':  {
            'has_match':   'npm install {match_1}',
            'after_update':'Faltante tras git pull — correr npm install',
        },
    },
    {
        'pattern':  r'ETIMEDOUT|ENOTFOUND|getaddrinfo',
        'type':     'api',
        'severity': 'medium',
        'message':  'Error de red / DNS',
        'fix_base': 'Verificar conexión a internet',
        'fix_ctx':  {
            'count_gt_5':  'Frecuente — inestabilidad de red · revisar ISP',
            'with_baileys':'Junto a errores Baileys — red es el problema raíz',
        },
    },
    {
        'pattern':  r'ENOMEM|Cannot allocate memory|MemoryError',
        'type':     'node',
        'severity': 'critical',
        'message':  'Sin memoria RAM',
        'fix_base': 'Reiniciar bot · cerrar procesos innecesarios',
        'fix_ctx':  {
            'default':     'RAM agotada — aumentar swap o reducir carga de ML',
        },
    },
    {
        'pattern':  r'SyntaxError|IndentationError',
        'type':     'lib',
        'severity': 'critical',
        'message':  'Error de sintaxis Python',
        'fix_base': 'Revisar archivo indicado en stack trace',
        'fix_ctx':  {
            'after_edit':  'Tras edición reciente — verificar indentación y comillas',
        },
    },
    {
        'pattern':  r'JavaScript heap out of memory',
        'type':     'node',
        'severity': 'critical',
        'message':  'Node.js sin memoria heap',
        'fix_base': 'node --max-old-space-size=4096 · o reiniciar bot',
        'fix_ctx':  {
            'count_gt_1':  'Recurrente — memory leak · revisar acumulación de datos en RAM',
        },
    },
]

ALL_PATTERNS = BAILEYS_PATTERNS + API_PATTERNS

# ─── Estado en RAM ────────────────────────────────────────────────────────────
_breaks_cache:    list[BreakEvent] = []
_cache_loaded:    bool             = False
_last_flush:      float            = 0.0
_flush_lock:      threading.Lock   = threading.Lock()
_recent_texts:    list[tuple[float, str]] = []   # (ts, text) ventana de contexto
_error_window:    defaultdict      = defaultdict(list)  # pattern_id → [timestamps]

# ─── Cache helpers ────────────────────────────────────────────────────────────
def _load_cache() -> list[BreakEvent]:
    global _breaks_cache, _cache_loaded
    if _cache_loaded:
        return _breaks_cache
    if not BREAK_LOG.exists():
        _breaks_cache = []
        _cache_loaded = True
        return _breaks_cache
    try:
        raw = json.loads(BREAK_LOG.read_text(encoding='utf-8'))
        _breaks_cache = [BreakEvent(**b) for b in raw]
    except Exception:
        _breaks_cache = []
    _cache_loaded = True
    return _breaks_cache

def _flush_to_disk(force: bool = False) -> None:
    global _last_flush
    with _flush_lock:
        now = time.time()
        if not force and (now - _last_flush) < FLUSH_COOLDOWN_S:
            return
        try:
            DATA_DIR.mkdir(parents=True, exist_ok=True)
            data = [asdict(b) for b in _breaks_cache[-MAX_BREAKS_DISK:]]
            BREAK_LOG.write_text(json.dumps(data, indent=2), encoding='utf-8')
            _last_flush = now
        except Exception as e:
            console.print(f'  [red]✗ break_detector flush error: {e}[/red]')

def _pattern_id(pattern: str, type_: str) -> str:
    return hashlib.md5(f'{pattern}:{type_}'.encode()).hexdigest()[:12]

# ─── Ventana de contexto ──────────────────────────────────────────────────────
def _add_to_context(text: str) -> None:
    now = time.time()
    _recent_texts.append((now, text))
    # limpiar textos viejos (>2min)
    cutoff = now - 120
    while _recent_texts and _recent_texts[0][0] < cutoff:
        _recent_texts.pop(0)

def _get_context_window() -> str:
    """Últimas 5 líneas como contexto"""
    return ' | '.join(t for _, t in _recent_texts[-5:])

# ─── Frecuencia ───────────────────────────────────────────────────────────────
def _record_occurrence(pid: str) -> float:
    """Registra ocurrencia y retorna frecuencia por hora"""
    now = time.time()
    _error_window[pid].append(now)
    # limpiar ocurrencias >1h
    cutoff = now - 3600
    _error_window[pid] = [t for t in _error_window[pid] if t > cutoff]
    count_1h = len(_error_window[pid])
    return round(count_1h / 1.0, 2)  # por hora

# ─── Sugerencia contextual inteligente ───────────────────────────────────────
def _build_smart_fix(pattern_def: dict, match: re.Match, break_event: BreakEvent) -> str:
    """
    Genera sugerencia adaptada al contexto real:
    - frecuencia del error
    - errores relacionados activos
    - contexto de líneas recientes
    - count acumulado
    """
    fix      = pattern_def['fix_base']
    fix_ctx  = pattern_def.get('fix_ctx', {})
    context  = _get_context_window().lower()
    count    = break_event.count
    freq     = break_event.frequency
    active   = [b for b in _breaks_cache if not b.resolved]
    active_patterns = ' '.join(b.pattern for b in active)

    # resolver {match_N}
    def resolve(s: str) -> str:
        for i, g in enumerate(match.groups(), 1):
            s = s.replace(f'{{match_{i}}}', g or '')
        return s

    # prioridad de contextos (de más a menos específico)
    checks = [
        ('count_gt_10', count > 10),
        ('count_gt_5',  count > 5),
        ('count_gt_3',  count > 3),
        ('count_gt_1',  count > 1),
        ('high_freq',   freq > 10),
        ('has_match',   bool(match.groups()) and any(g for g in match.groups())),
        ('after_update','version_change' in active_patterns),
        ('with_timeout','ETIMEDOUT' in context or 'timeout' in context),
        ('with_closed', 'connection closed' in context),
        ('with_baileys',any(b.type == 'baileys' for b in active)),
        ('in_handler',  'handler' in context),
        ('in_command',  'command' in context or 'cmd' in context),
        ('in_group',    '@g.us' in context),
        ('after_start', 'iniciando' in context or 'starting' in context),
        ('after_edit',  'syntaxerror' in context),
        ('default',     True),
    ]

    for key, condition in checks:
        if condition and key in fix_ctx:
            fix = fix_ctx[key]
            break

    return resolve(fix)

# ─── Agrupar errores similares ────────────────────────────────────────────────
def _compute_group_id(message: str, type_: str) -> str:
    """
    Agrupa errores del mismo tipo y mensaje similar.
    Usa las primeras palabras significativas como clave de grupo.
    """
    words = re.sub(r'[^a-zA-Z\s]', '', message.lower()).split()
    key   = f'{type_}:' + '_'.join(words[:4])
    return hashlib.md5(key.encode()).hexdigest()[:8]

# ─── Auto-limpiar breaks viejos ───────────────────────────────────────────────
def _auto_resolve_old() -> int:
    """Resuelve automáticamente breaks que no reincidieron en AUTO_RESOLVE_H horas"""
    cutoff  = (datetime.utcnow() - timedelta(hours=AUTO_RESOLVE_H)).isoformat()
    count   = 0
    for b in _breaks_cache:
        if not b.resolved and b.severity in ('low', 'medium') and b.last_seen < cutoff:
            b.resolved = True
            count += 1
    return count

# ─── Core: analizar texto ─────────────────────────────────────────────────────
def analyze_text(text: str) -> list[BreakEvent]:
    breaks = _load_cache()
    _add_to_context(text)
    found = []
    now   = datetime.utcnow().isoformat()

    for pattern_def in ALL_PATTERNS:
        match = re.search(pattern_def['pattern'], text, re.IGNORECASE)
        if not match:
            continue

        pid = _pattern_id(pattern_def['pattern'], pattern_def['type'])

        existing = next((b for b in breaks if b.id == pid and not b.resolved), None)
        if existing:
            last_dt  = datetime.fromisoformat(existing.last_seen)
            elapsed  = (datetime.utcnow() - last_dt).total_seconds()
            existing.count        += 1
            existing.last_seen     = now
            existing.frequency     = _record_occurrence(pid)
            existing.suggested_fix = _build_smart_fix(pattern_def, match, existing)
            if elapsed > DEDUP_WINDOW_S:
                found.append(existing)
                # alerta — ya existía pero reincidió fuera de ventana
                try:
                    from ai.alert_system import alert_from_break
                    alert_from_break(existing)
                except Exception:
                    pass
        else:
            freq  = _record_occurrence(pid)
            event = BreakEvent(
                id            = pid,
                type          = pattern_def['type'],
                severity      = pattern_def['severity'],
                message       = pattern_def['message'],
                pattern       = pattern_def['pattern'],
                first_seen    = now,
                last_seen     = now,
                frequency     = freq,
                context       = _get_context_window()[:200],
                group_id      = _compute_group_id(pattern_def['message'], pattern_def['type']),
            )
            event.suggested_fix = _build_smart_fix(pattern_def, match, event)
            breaks.append(event)
            found.append(event)
            # alerta — rotura nueva
            try:
                from ai.alert_system import alert_from_break
                alert_from_break(event)
            except Exception:
                pass

    if found:
        _flush_to_disk()

    return found

# ─── Versión de Baileys ───────────────────────────────────────────────────────
def check_baileys_version() -> Optional[BreakEvent]:
    version_file = DATA_DIR / 'last_baileys_version.txt'
    pkg_file     = ROOT_DIR / 'node_modules' / '@whiskeysockets' / 'baileys' / 'package.json'
    if not pkg_file.exists():
        return None
    try:
        current = json.loads(pkg_file.read_text(encoding='utf-8')).get('version', 'unknown')
        last    = version_file.read_text(encoding='utf-8').strip() if version_file.exists() else None
        version_file.write_text(current, encoding='utf-8')
        if last and last != current:
            breaks = _load_cache()
            now    = datetime.utcnow().isoformat()
            pid    = _pattern_id('baileys_version_change', 'baileys')
            event  = BreakEvent(
                id            = pid,
                type          = 'baileys',
                severity      = 'medium',
                message       = f'Baileys actualizado: {last} → {current}',
                pattern       = 'version_change',
                first_seen    = now,
                last_seen     = now,
                suggested_fix = f'Revisar: github.com/WhiskeySockets/Baileys/releases/tag/v{current}',
                group_id      = _compute_group_id('baileys version change', 'baileys'),
            )
            breaks.append(event)
            _flush_to_disk(force=True)
            return event
    except Exception:
        pass
    return None

# ─── Breaking changes en API ──────────────────────────────────────────────────
def check_baileys_breaking_changes() -> list[BreakEvent]:
    USED_METHODS = [
        'sendMessage', 'groupMetadata', 'groupParticipantsUpdate',
        'groupUpdateSubject', 'groupUpdateDescription',
        'sendPresenceUpdate', 'readMessages',
    ]
    # los métodos del socket están en lib/Socket/*.d.ts (no en lib/Types/)
    socket_dir = ROOT_DIR / 'node_modules' / '@whiskeysockets' / 'baileys' / 'lib' / 'Socket'
    content = ''
    if socket_dir.exists():
        for f in socket_dir.glob('*.d.ts'):
            try:
                content += f.read_text(errors='ignore')
            except Exception:
                pass

    if not content:
        return []

    try:
        breaks   = _load_cache()
        missing  = []
        now      = datetime.utcnow().isoformat()
        resolved = 0
        for method in USED_METHODS:
            pid = _pattern_id(f'missing_{method}', 'baileys')
            if method not in content:
                if not any(b.id == pid for b in breaks):
                    event = BreakEvent(
                        id            = pid,
                        type          = 'baileys',
                        severity      = 'critical',
                        message       = f'Método desapareció: sock.{method}()',
                        pattern       = f'missing_{method}',
                        first_seen    = now,
                        last_seen     = now,
                        suggested_fix = f'Buscar reemplazo de {method} en types/Socket.d.ts · revisar changelog',
                        group_id      = _compute_group_id(f'missing method {method}', 'baileys'),
                    )
                    missing.append(event)
                    breaks.append(event)
            else:
                # método presente — resolver break existente si lo hay
                for b in breaks:
                    if b.id == pid and not b.resolved:
                        b.resolved = True
                        resolved += 1
        if missing or resolved:
            _flush_to_disk(force=True)
        return missing
    except Exception:
        return []

# ─── Auto-limpiar + priorizar ─────────────────────────────────────────────────
def run_break_detection() -> BreakReport:
    breaks = _load_cache()

    # auto-resolver viejos
    resolved_count = _auto_resolve_old()
    if resolved_count:
        _flush_to_disk(force=True)

    # checks proactivos
    new_breaks: list[BreakEvent] = []
    v = check_baileys_version()
    if v:
        new_breaks.append(v)
    new_breaks.extend(check_baileys_breaking_changes())

    # activos — ordenados por prioridad: severity + frecuencia
    severity_order = {'critical': 0, 'high': 1, 'medium': 2, 'low': 3}
    active = sorted(
        [b for b in breaks if not b.resolved],
        key=lambda b: (severity_order.get(b.severity, 9), -b.frequency, -b.count)
    )
    resolved = [b for b in breaks if b.resolved]

    # agrupar activos por group_id
    groups: dict[str, list] = defaultdict(list)
    for b in active:
        groups[b.group_id].append(b.message)

    return BreakReport(
        timestamp  = datetime.utcnow().isoformat(),
        total      = len(active),
        critical   = sum(1 for b in active if b.severity == 'critical'),
        new_breaks = [asdict(b) for b in new_breaks],
        active     = [asdict(b) for b in active],
        resolved   = [asdict(b) for b in resolved[-10:]],
        groups     = {k: v for k, v in groups.items() if len(v) > 1},
    )

# ─── Print ────────────────────────────────────────────────────────────────────
def print_break_report(report: BreakReport) -> None:
    COLOR  = {'critical':'red', 'high':'yellow', 'medium':'cyan', 'low':'dim'}
    ICON   = {'critical':'✗',   'high':'§',      'medium':'◆',    'low':'·'}

    if not report.active:
        console.print('  [green]✔ Break Detector — sin roturas activas[/green]')
        return

    console.print(f'\n  [red]◆ Break Detector — {report.total} activa(s) · {report.critical} crítica(s)[/red]')

    # mostrar agrupados primero
    shown_ids = set()
    if report.groups:
        console.print('  [dim]── grupos ──[/dim]')
        for gid, messages in report.groups.items():
            console.print(f'  [cyan]◆ Grupo ({len(messages)} errores similares):[/cyan]')
            for m in messages[:3]:
                console.print(f'    [dim]· {m}[/dim]')

    console.print('  [dim]── detalle ──[/dim]')
    for b in report.active[:10]:  # máximo 10 en pantalla
        sev   = b.get('severity', 'low')
        freq  = b.get('frequency', 0)
        count = b.get('count', 1)
        color = COLOR.get(sev, 'white')
        icon  = ICON.get(sev, '·')
        freq_str = f' [{freq:.0f}/h]' if freq > 1 else ''
        count_str = f' x{count}' if count > 1 else ''
        console.print(f'  [{color}]{icon} {b["message"]}{count_str}{freq_str}[/{color}]')
        if b.get('suggested_fix'):
            console.print(f'    [dim]→ {b["suggested_fix"]}[/dim]')

    if report.new_breaks:
        console.print(f'\n  [yellow]§ {len(report.new_breaks)} nueva(s) rotura(s)[/yellow]')
    console.print()

# ─── API pública ──────────────────────────────────────────────────────────────
def run_once() -> BreakReport:
    return run_break_detection()

def analyze_line(line: str) -> list[BreakEvent]:
    return analyze_text(line)

def get_active_breaks() -> list[BreakEvent]:
    return [b for b in _load_cache() if not b.resolved]

def resolve_break(break_id: str) -> bool:
    for b in _load_cache():
        if b.id == break_id:
            b.resolved = True
            _flush_to_disk(force=True)
            return True
    return False