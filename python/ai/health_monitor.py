"""
WinsiBot — Health Monitor
Detecta errores, anomalias y problemas en tiempo real
"""

import asyncio
import json
import time
import httpx
import psutil
import threading
from pathlib import Path
from datetime import datetime
from dataclasses import dataclass, asdict
from typing import Optional
from rich.console import Console
import re
import collections
from statistics import mean, stdev

console = Console()

# ─── Paths ────────────────────────────────────────────────────────────────────
ROOT       = Path(__file__).parent.parent.parent
DATA_DIR   = ROOT / 'data'
HEALTH_LOG = DATA_DIR / 'health_log.json'

# ─── Config ───────────────────────────────────────────────────────────────────
FLASK_URL    = 'http://localhost:5000'
PHP_URL      = 'http://localhost:8080'
CHECK_EVERY  = 30   # segundos entre checks
MAX_RAM_PCT  = 92   # % RAM maxima antes de alerta (Windows usa ~80-85% idle con 16GB)
MAX_CPU_PCT  = 90   # % CPU maxima antes de alerta
MAX_LOG_SIZE = 500  # max entradas en health_log.json

# ─── Latencia ────────
LATENCY_WARN_MS  = 200
LATENCY_ERROR_MS = 500

# ─── Memory Leak ─────────
_ram_history: collections.deque = collections.deque(maxlen=20)  # ultimos 10min (20 x 30s)

# ─── Inestabilidad ───────────
_restart_log: list[float] = []   # timestamps de reinicios detectados
_cpu_history:  collections.deque = collections.deque(maxlen=10)

# ─── Error Rate Real ────────────────
LOG_PATTERNS = {
    'error':   re.compile(r'\b(ERROR|FATAL|UNCAUGHT|UNHANDLED|EXCEPTION)\b', re.I),
    'warn':    re.compile(r'\b(WARN|WARNING|DEPRECATED)\b', re.I),
    'baileys': re.compile(r'\b(Connection Closed|Stream Errored|lost connection)\b', re.I),
    'timeout': re.compile(r'\b(timeout|ETIMEDOUT|ECONNREFUSED)\b', re.I),
}

# ─── Proceso Freeze ───────────
_process_snapshots: dict[str, dict] = {}   # { 'node': {pid, cpu_last, ts} }

# ─── Tipos ────────────────────────────────────────────────────────────────────
@dataclass
class HealthCheck:
    name:      str
    status:    str          # ok | warn | error
    message:   str
    value:     Optional[float] = None
    timestamp: str = ''

    def __post_init__(self):
        if not self.timestamp:
            self.timestamp = datetime.utcnow().isoformat()

@dataclass
class HealthReport:
    timestamp:  str
    status:     str          # ok | warn | critical
    checks:     list
    score:      float        # 0-100
    alerts:     list

# ─── Checks individuales ──────────────────────────────────────────────────────

def check_ram() -> HealthCheck:
    """Verifica uso de RAM"""
    mem = psutil.virtual_memory()
    pct = mem.percent

    if pct > MAX_RAM_PCT:
        return HealthCheck('ram', 'error', f'RAM critica: {pct:.1f}%', pct)
    if pct > 70:
        return HealthCheck('ram', 'warn', f'RAM alta: {pct:.1f}%', pct)
    return HealthCheck('ram', 'ok', f'RAM normal: {pct:.1f}%', pct)

def check_cpu() -> HealthCheck:
    """Verifica uso de CPU"""
    pct = psutil.cpu_percent(interval=1)

    if pct > MAX_CPU_PCT:
        return HealthCheck('cpu', 'error', f'CPU critica: {pct:.1f}%', pct)
    if pct > 75:
        return HealthCheck('cpu', 'warn', f'CPU alta: {pct:.1f}%', pct)
    return HealthCheck('cpu', 'ok', f'CPU normal: {pct:.1f}%', pct)

def check_disk() -> HealthCheck:
    """Verifica espacio en disco"""
    disk = psutil.disk_usage(str(ROOT))
    pct  = disk.percent
    free_gb = disk.free / (1024 ** 3)

    if pct > 95 or free_gb < 1:
        return HealthCheck('disk', 'error', f'Disco critico: {free_gb:.1f}GB libre', pct)
    if pct > 85:
        return HealthCheck('disk', 'warn', f'Disco bajo: {free_gb:.1f}GB libre', pct)
    return HealthCheck('disk', 'ok', f'Disco OK: {free_gb:.1f}GB libre', pct)

async def check_flask() -> HealthCheck:
    """Verifica que Flask responda"""
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            r = await client.get(f'{FLASK_URL}/api/v1/health')
            if r.status_code == 200:
                data = r.json()
                if data.get('data', {}).get('status') == 'online':
                    return HealthCheck('flask', 'ok', 'Flask online')
            return HealthCheck('flask', 'warn', f'Flask responde pero status: {r.status_code}')
    except httpx.ConnectError:
        return HealthCheck('flask', 'error', 'Flask no responde — puerto 5000 cerrado')
    except Exception as e:
        return HealthCheck('flask', 'error', f'Flask error: {str(e)[:50]}')

async def check_php() -> HealthCheck:
    """Verifica que PHP panel responda"""
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            r = await client.get(f'{PHP_URL}/health')
            if r.status_code == 200:
                return HealthCheck('php', 'ok', 'PHP panel online')
            return HealthCheck('php', 'warn', f'PHP responde pero status: {r.status_code}')
    except httpx.ConnectError:
        return HealthCheck('php', 'warn', 'PHP panel offline — no critico')
    except Exception as e:
        return HealthCheck('php', 'warn', f'PHP error: {str(e)[:50]}')

def check_session() -> HealthCheck:
    """Verifica integridad de la sesion de WhatsApp"""
    auth_dir = ROOT / 'auth'
    if not auth_dir.exists():
        return HealthCheck('session', 'error', 'Carpeta auth no existe')

    creds = auth_dir / 'creds.json'
    if not creds.exists():
        return HealthCheck('session', 'error', 'creds.json no encontrado')

    try:
        data = json.loads(creds.read_text(encoding='utf-8'))
        if not data.get('me', {}).get('id'):
            return HealthCheck('session', 'error', 'Session invalida — campo me.id ausente')

        files = list(auth_dir.iterdir())
        return HealthCheck('session', 'ok', f'Session OK — {len(files)} archivos')
    except Exception as e:
        return HealthCheck('session', 'error', f'Session corrupta: {str(e)[:50]}')

def check_data_dir() -> HealthCheck:
    """Verifica que los archivos de datos esten bien (solo si existen)"""
    issues = []

    # verificar store.json — solo si existe
    store = DATA_DIR / 'store.json'
    if store.exists():
        try:
            json.loads(store.read_text(encoding='utf-8'))
        except Exception:
            issues.append('store.json corrupto')

    # verificar session_log.json — solo si existe
    log = DATA_DIR / 'session_log.json'
    if log.exists():
        try:
            json.loads(log.read_text(encoding='utf-8'))
        except Exception:
            issues.append('session_log.json corrupto')

    # verificar backups — solo warn suave, no critico
    backup_dir = DATA_DIR / 'session_backups'
    if backup_dir.exists() and not list(backup_dir.iterdir()):
        issues.append('carpeta backups vacia')

    if issues:
        return HealthCheck('data', 'warn', f'Problemas: {", ".join(issues)}')
    return HealthCheck('data', 'ok', 'Archivos de datos OK')

def check_node_process() -> HealthCheck:
    """Verifica que el proceso de Node.js este corriendo"""
    for proc in psutil.process_iter(['name', 'cmdline']):
        try:
            cmdline = ' '.join(proc.info.get('cmdline') or [])
            if ('tsx' in cmdline and 'index.ts' in cmdline) or \
                ('node' in cmdline and 'winsibot' in cmdline.lower()) or \
                ('tsx' in (proc.info.get('name') or '').lower()):
                mem_mb = proc.memory_info().rss / (1024 ** 2)
                return HealthCheck('node', 'ok', f'Node.js corriendo — {mem_mb:.1f}MB RAM', mem_mb)
        except Exception:
            continue
    return HealthCheck('node', 'error', 'Proceso Node.js no encontrado')

def check_python_process() -> HealthCheck:
    """Verifica que Flask este corriendo como proceso"""
    for proc in psutil.process_iter(['name', 'cmdline']):
        try:
            cmdline = ' '.join(proc.info.get('cmdline') or [])
            if 'flask' in cmdline or 'app.py' in cmdline:
                mem_mb = proc.memory_info().rss / (1024 ** 2)
                return HealthCheck('python', 'ok', f'Flask corriendo — {mem_mb:.1f}MB RAM', mem_mb)
        except Exception:
            continue
    return HealthCheck('python', 'warn', 'Flask no encontrado como proceso')

def check_error_rate() -> HealthCheck:
    """Analiza el log de sesion para detectar patron de errores"""
    if not HEALTH_LOG.exists():
        return HealthCheck('error_rate', 'ok', 'Sin historial de errores')

    try:
        logs = json.loads(HEALTH_LOG.read_text(encoding='utf-8'))
        recent = [
            l for l in logs
            if l.get('status') == 'error'
            and l.get('timestamp', '') > datetime.utcnow().isoformat()[:13]  # ultima hora
        ]
        count = len(recent)

        if count > 10:
            return HealthCheck('error_rate', 'error', f'{count} errores en la ultima hora', float(count))
        if count > 5:
            return HealthCheck('error_rate', 'warn', f'{count} errores en la ultima hora', float(count))
        return HealthCheck('error_rate', 'ok', f'{count} errores en la ultima hora', float(count))
    except Exception:
        return HealthCheck('error_rate', 'ok', 'No se pudo analizar historial')
    
async def check_latency() -> HealthCheck:
    """Mide latencia real de Flask en ms"""
    results = {}
    endpoints = [
        ('flask', f'{FLASK_URL}/api/v1/health'),
        ('php',   f'{PHP_URL}/health'),
    ]
    async with httpx.AsyncClient(timeout=5) as client:
        for name, url in endpoints:
            try:
                t0 = time.perf_counter()
                await client.get(url)
                ms = (time.perf_counter() - t0) * 1000
                results[name] = round(ms, 1)
            except Exception:
                results[name] = None

    flask_ms = results.get('flask')
    if flask_ms is None:
        return HealthCheck('latency', 'error', 'Flask no responde — latencia infinita')
    if flask_ms > LATENCY_ERROR_MS:
        return HealthCheck('latency', 'error',  f'Latencia critica: Flask {flask_ms}ms', flask_ms)
    if flask_ms > LATENCY_WARN_MS:
        return HealthCheck('latency', 'warn',   f'Latencia alta: Flask {flask_ms}ms',    flask_ms)
    return     HealthCheck('latency', 'ok',     f'Latencia OK: Flask {flask_ms}ms',      flask_ms)

def _get_bot_rss_mb() -> float:
    """RSS combinado de Node.js + Python/Flask del bot (no sistema entero)"""
    total = 0.0
    bot_procs = ('tsx', 'index.ts', 'app.py', 'uvicorn')
    for proc in psutil.process_iter(['name', 'cmdline', 'memory_info']):
        try:
            cmdline = ' '.join(proc.info.get('cmdline') or [])
            if any(k in cmdline for k in bot_procs):
                total += proc.memory_info().rss / (1024 ** 2)
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            continue
    return round(total, 1)

def check_memory_leak() -> HealthCheck:
    """
    Detecta memory leaks en los procesos del bot (Node + Python), NO el sistema entero.
    Si el RSS combinado sube >2MB/min de forma estable = leak probable.
    """
    used_mb = _get_bot_rss_mb()
    if used_mb == 0:
        # bot no detectado — usar sistema como fallback
        used_mb = psutil.virtual_memory().used / (1024 ** 2)

    _ram_history.append((time.time(), used_mb))

    if len(_ram_history) < 4:
        return HealthCheck('mem_leak', 'ok', f'Bot RAM: {used_mb:.0f}MB — acumulando datos', used_mb)

    # calcular tendencia: MB ganados por minuto
    oldest_t, oldest_mb = _ram_history[0]
    elapsed_min = (time.time() - oldest_t) / 60
    if elapsed_min < 0.5:
        return HealthCheck('mem_leak', 'ok', f'Bot RAM: {used_mb:.0f}MB — muy poco tiempo', used_mb)

    delta_mb    = used_mb - oldest_mb
    rate_mb_min = delta_mb / elapsed_min

    values   = [mb for _, mb in _ram_history]
    variance = stdev(values) if len(values) > 1 else 0

    if rate_mb_min > 5 and variance < 50:
        return HealthCheck('mem_leak', 'error',
            f'Leak probable: +{rate_mb_min:.1f}MB/min — bot {used_mb:.0f}MB', rate_mb_min)
    if rate_mb_min > 2:
        return HealthCheck('mem_leak', 'warn',
            f'Bot RAM subiendo: +{rate_mb_min:.1f}MB/min ({used_mb:.0f}MB total)', rate_mb_min)
    if rate_mb_min < -1:
        return HealthCheck('mem_leak', 'ok',
            f'Bot RAM liberandose: {rate_mb_min:.1f}MB/min ({used_mb:.0f}MB)', rate_mb_min)

    return HealthCheck('mem_leak', 'ok', f'Bot RAM estable: {used_mb:.0f}MB ({rate_mb_min:+.1f}MB/min)', used_mb)

def _record_restart():
    """Llamar cuando detectes que Node o Flask se reiniciaron"""
    _restart_log.append(time.time())
    # limpiar reinicios viejos (>1 hora)
    cutoff = time.time() - 3600
    while _restart_log and _restart_log[0] < cutoff:
        _restart_log.pop(0)
        
def check_instability() -> HealthCheck:
    """
    Detecta inestabilidad del sistema midiendo:
    - reinicios en la ultima hora
    - varianza de CPU (picos irregulares = inestable)
    """
    cpu_pct = psutil.cpu_percent(interval=0.5)
    _cpu_history.append(cpu_pct)

    restarts_1h  = len(_restart_log)
    cpu_variance = stdev(_cpu_history) if len(_cpu_history) > 2 else 0

    issues = []
    level  = 'ok'

    if restarts_1h >= 3:
        issues.append(f'{restarts_1h} reinicios/hora')
        level = 'error'
    elif restarts_1h >= 1:
        issues.append(f'{restarts_1h} reinicio/hora')
        level = 'warn'

    if cpu_variance > 30:
        issues.append(f'CPU muy variable (σ={cpu_variance:.0f})')
        level = 'error' if level == 'error' else 'warn'
    elif cpu_variance > 15:
        issues.append(f'CPU algo variable (σ={cpu_variance:.0f})')
        if level == 'ok':
            level = 'warn'

    if not issues:
        return HealthCheck('instability', 'ok',
            f'Sistema estable — CPU σ={cpu_variance:.0f}, 0 reinicios')

    return HealthCheck('instability', level, ' · '.join(issues), float(restarts_1h))

def check_error_rate_real() -> HealthCheck:
    """
    Parsea logs reales de Node.js para calcular tasa de errores por minuto.
    Busca en data/logs/ o usa el health_log.json como fallback.
    """
    log_dir = ROOT / 'data' / 'logs'
    counts  = {k: 0 for k in LOG_PATTERNS}
    lines_read = 0

    # buscar archivos de log recientes
    log_files = []
    if log_dir.exists():
        log_files = sorted(log_dir.glob('*.log'), key=lambda f: f.stat().st_mtime, reverse=True)[:3]

    # fallback: analizar health_log
    if not log_files and HEALTH_LOG.exists():
        try:
            logs = json.loads(HEALTH_LOG.read_text(encoding='utf-8'))
            errors_1h = sum(1 for l in logs if l.get('status') in ('error', 'critical'))
            if errors_1h > 5:
                return HealthCheck('error_rate', 'warn',
                    f'{errors_1h} ciclos en error (historial health)', float(errors_1h))
            return HealthCheck('error_rate', 'ok',
                f'{errors_1h} ciclos con error en historial', float(errors_1h))
        except Exception:
            pass
        return HealthCheck('error_rate', 'ok', 'Sin logs disponibles', 0.0)

    # parsear logs
    cutoff_ts = time.time() - 3600  # ultima hora
    for log_file in log_files:
        try:
            stat = log_file.stat()
            if stat.st_mtime < cutoff_ts:
                continue
            # leer ultimas 500 lineas (eficiente)
            with open(log_file, 'r', encoding='utf-8', errors='ignore') as f:
                recent_lines = collections.deque(f, maxlen=500)
            for line in recent_lines:
                lines_read += 1
                for key, pattern in LOG_PATTERNS.items():
                    if pattern.search(line):
                        counts[key] += 1
        except Exception:
            continue

    if lines_read == 0:
        return HealthCheck('error_rate', 'ok', 'Logs vacios o sin acceso', 0.0)

    total_errors   = counts['error']
    baileys_errors = counts['baileys']
    timeouts       = counts['timeout']

    msg_parts = []
    if total_errors   > 0: msg_parts.append(f'{total_errors} ERRORs')
    if baileys_errors > 0: msg_parts.append(f'{baileys_errors} Baileys drops')
    if timeouts       > 0: msg_parts.append(f'{timeouts} timeouts')

    if total_errors > 20 or baileys_errors > 5:
        return HealthCheck('error_rate', 'error',
            ' · '.join(msg_parts) + f' (en {lines_read} lineas)', float(total_errors))
    if total_errors > 5 or baileys_errors > 1:
        return HealthCheck('error_rate', 'warn',
            ' · '.join(msg_parts) or 'Errores leves', float(total_errors))

    return HealthCheck('error_rate', 'ok',
        f'Logs limpios — {lines_read} lineas analizadas', float(total_errors))
    
_process_snapshots: dict[str, dict] = {}

def check_process_freeze() -> HealthCheck:
    """
    Detecta freeze REAL: proceso activo pero CPU=0% Y no responde HTTP.
    CPU=0% solo en idle no es freeze — verificar con ping HTTP.
    """
    import httpx
    import asyncio

    targets = [
        ('node',  lambda c: 'tsx' in c and 'index.ts' in c, 'http://127.0.0.1:4001/health'),
        ('flask', lambda c: 'uvicorn' in c or 'app.py' in c, 'http://localhost:5000/api/v1/health'),
    ]

    frozen = []

    for name, matcher, health_url in targets:
        for proc in psutil.process_iter(['pid', 'name', 'cmdline', 'status']):
            try:
                cmdline = ' '.join(proc.info.get('cmdline') or [])
                if not matcher(cmdline):
                    continue

                pid     = proc.info['pid']
                cpu_now = proc.cpu_percent(interval=0.5)
                now     = time.time()
                prev    = _process_snapshots.get(name, {})

                # proceso nuevo — registrar
                if prev.get('pid') != pid:
                    _record_restart()
                    _process_snapshots[name] = {
                        'pid': pid, 'cpu_last': cpu_now,
                        'ts_zero': now, 'freeze_confirmed': False
                    }
                    break

                # actualizar snapshot
                snap = _process_snapshots[name]
                snap['cpu_last'] = cpu_now

                if cpu_now >= 0.1:
                    # CPU activa — resetear
                    snap['ts_zero']          = now
                    snap['freeze_confirmed'] = False
                    break

                frozen_secs = now - snap.get('ts_zero', now)

                # CPU=0% por más de 90s — verificar con HTTP si aplica
                if frozen_secs > 90:
                    if health_url:
                        # verificar si responde HTTP — si responde NO es freeze
                        try:
                            with httpx.Client(timeout=3) as client:
                                r = client.get(health_url)
                                if r.status_code == 200:
                                    # responde OK — solo está idle, no frozen
                                    snap['ts_zero'] = now  # resetear
                                    break
                        except Exception:
                            # no responde HTTP Y CPU=0% — freeze confirmado
                            if not snap.get('freeze_confirmed'):
                                snap['freeze_confirmed'] = True
                                frozen.append(f'{name} freeze confirmado {frozen_secs:.0f}s')
                    else:
                        # node — sin HTTP check, usar umbral más alto (300s)
                        if frozen_secs > 300:
                            frozen.append(f'{name} freeze {frozen_secs:.0f}s')

                break
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                continue

    if frozen:
        return HealthCheck('freeze', 'error', ' · '.join(frozen))

    return HealthCheck('freeze', 'ok', 'Todos los procesos activos')

# ─── Smart Log Buffer ─────────────────────────────────────────────────────────
class SmartLogBuffer:
    """
    Buffer rotativo que guarda solo los logs ÚTILES:
    - Siempre guarda si status != ok
    - Para status ok: guarda 1 de cada 10 (muestreo)
    - Mantiene los ultimos N registros en RAM para queries rápidas
    - Escribe a disco solo cuando hay cambios relevantes
    """
    def __init__(self, path: Path, max_disk: int = 500, max_ram: int = 50):
        self.path      = path
        self.max_disk  = max_disk
        self.max_ram   = max_ram
        self._buffer:  collections.deque = collections.deque(maxlen=max_ram)
        self._ok_skip  = 0
        self._dirty    = False

    def add(self, report: 'HealthReport') -> None:
        is_ok   = report.status == 'ok'
        # muestrear ok: 1 de cada 10
        if is_ok:
            self._ok_skip += 1
            if self._ok_skip % 10 != 0:
                return

        entry = asdict(report)
        self._buffer.append(entry)
        self._dirty = True

    def flush(self) -> None:
        """Escribe a disco solo si hay cambios"""
        if not self._dirty:
            return
        try:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            existing = []
            if self.path.exists():
                try:
                    existing = json.loads(self.path.read_text(encoding='utf-8'))
                except Exception:
                    existing = []
            combined = existing + list(self._buffer)
            combined = combined[-self.max_disk:]
            self.path.write_text(json.dumps(combined, indent=2), encoding='utf-8')
            self._dirty = False
        except Exception as e:
            console.print(f'  [yellow]§ SmartLogBuffer flush error: {e}[/yellow]')

    def recent(self, n: int = 10) -> list:
        """Últimos N registros en RAM (muy rápido, sin disco)"""
        return list(self._buffer)[-n:]

    def errors_last_hour(self) -> int:
        cutoff = datetime.utcnow().isoformat()[:13]
        return sum(1 for r in self._buffer
                   if r.get('status') in ('error', 'critical')
                   and r.get('timestamp', '') >= cutoff)
        
# instancia global
_log_buffer = SmartLogBuffer(HEALTH_LOG)

# ─── Score ────────────────────────────────────────────────────────────────────
def calculate_score(checks: list[HealthCheck]) -> float:
    weights = {
        'session':    25,
        'flask':      15,
        'node':       15,
        'latency':    10,   # ← NUEVO
        'mem_leak':    8,   # ← NUEVO
        'ram':         7,
        'freeze':      7,   # ← NUEVO
        'instability': 5,   # ← NUEVO
        'cpu':         4,
        'error_rate':  2,   # ← antes era 0
        'disk':        1,
        'data':        1,
        'php':         0,
        'python':      0,
    }
    total_weight = sum(weights.values())
    score = 0.0
    for check in checks:
        w = weights.get(check.name, 1)
        if check.status == 'ok':
            score += w
        elif check.status == 'warn':
            score += w * 0.5
    return round((score / total_weight) * 100, 1)

# ─── Reporter ─────────────────────────────────────────────────────────────────
def save_report(report: HealthReport) -> None:
    """Ahora usa SmartLogBuffer"""
    _log_buffer.add(report)
    _log_buffer.flush()

def print_report(report: HealthReport) -> None:
    """Imprime reporte en consola con colores"""
    status_color = {
        'ok':       'green',
        'warn':     'yellow',
        'critical': 'red',
    }
    color = status_color.get(report.status, 'white')

    console.print(f'\n  [{color}]◆ Health Check — {report.status.upper()}[/{color}]  Score: [{color}]{report.score}%[/{color}]')

    for check in report.checks:
        icon  = '✔' if check['status'] == 'ok' else '§' if check['status'] == 'warn' else '✗'
        clr   = 'green' if check['status'] == 'ok' else 'yellow' if check['status'] == 'warn' else 'red'
        console.print(f'  [{clr}]{icon}[/{clr}] {check["name"]:12} {check["message"]}')

    if report.alerts:
        console.print(f'\n  [red]§ ALERTAS:[/red]')
        for alert in report.alerts:
            console.print(f'  [red]  ✗ {alert}[/red]')

    console.print()

# ─── Runner principal ─────────────────────────────────────────────────────────
async def run_health_check() -> HealthReport:
    """Ejecuta todos los checks incluyendo los 6 nuevos"""
    async_checks = await asyncio.gather(
        check_flask(),
        check_php(),
        check_latency(),
    )
    sync_checks = [
        check_ram(),
        check_cpu(),
        check_disk(),
        check_session(),
        check_data_dir(),
        check_node_process(),
        check_python_process(),
        check_memory_leak(),
        check_instability(),
        check_error_rate_real(),
        check_process_freeze(),
    ]

    all_checks = list(async_checks) + sync_checks
    score      = calculate_score(all_checks)
    alerts     = [c.message for c in all_checks if c.status == 'error']

    if score < 50 or any(c.name in ('session', 'node', 'freeze') and c.status == 'error' for c in all_checks):
        status = 'critical'
    elif score < 75 or alerts:
        status = 'warn'
    else:
        status = 'ok'

    report = HealthReport(
        timestamp = datetime.utcnow().isoformat(),
        status    = status,
        checks    = [asdict(c) for c in all_checks],
        score     = score,
        alerts    = alerts,
    )
    save_report(report)

    # ─── disparar alertas ─────────────────────────────────────────────────────
    try:
        from ai.alert_system import alert_from_health
        alert_from_health(report)
    except Exception:
        pass

    return report

def run_once() -> HealthReport:
    """Ejecutar una sola vez — sincrono"""
    return asyncio.run(run_health_check())

# def run_loop(interval: int = CHECK_EVERY, verbose: bool = True):
    #"""Loop continuo de health checks"""
    #console.print(f'  [cyan]◆ Health Monitor iniciado — cada {interval}s[/cyan]')
    #while True:
        #try:
            #report = asyncio.run(run_health_check())
            #if verbose or report.status != 'ok':
            #    print_report(report)
        #except Exception as e:
            #console.print(f'  [red]✗ Error en health check: {e}[/red]')
        #time.sleep(interval)
        
def run_loop(interval: int = CHECK_EVERY, verbose: bool = True):
    """Solo imprime UNA VEZ cuando hay problema. Silencio total si todo ok."""
    console.print(f'  [cyan]◆ Health Monitor iniciado — cada {interval}s[/cyan]')
    already_alerted = False

    while True:
        try:
            report = asyncio.run(run_health_check())

            if report.status in ('warn', 'critical'):
                if not already_alerted:
                    print_report(report)
                    already_alerted = True
            else:
                # volvió a ok — resetear para próxima alerta
                already_alerted = False

        except Exception as e:
            console.print(f'  [red]✗ Error en health check: {e}[/red]')
        time.sleep(interval)

def start_background(interval: int = CHECK_EVERY):
    """Inicia health monitor en thread background"""
    t = threading.Thread(
        target = run_loop,
        kwargs = { 'interval': interval, 'verbose': False },
        daemon = True,
        name   = 'HealthMonitor',
    )
    t.start()
    return t