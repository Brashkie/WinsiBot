#!/usr/bin/env python3
"""
WinsiBot Manager — CLI de mantenimiento multi-servicio
Orquesta Rust (session API), FastAPI y Node para diagnóstico y reparación.

Uso:
  python manage.py              menú interactivo
  python manage.py <comando>    ejecutar directo

Comandos:
  status        Estado de todos los servicios
  diagnose      Análisis profundo: sesión, archivos Signal, logs, breaks
  repair        Reparación automática (signal + creds + backups)
  reset-signal  Solo borrar archivos Signal corruptos (mantiene creds.json)
  reset-qr      Eliminar sesión completa y forzar nuevo QR
  backup        Forzar backup de sesión
  restore       Restaurar sesión desde backup con selección
  logs          Ver últimos eventos del log de sesión
"""

import sys
import os
import json
import shutil
import subprocess
import time
import urllib.request
import urllib.error
from pathlib import Path
from datetime import datetime
from typing import Optional

from rich.console  import Console
from rich.table    import Table
from rich.panel    import Panel
from rich.prompt   import Prompt, Confirm
from rich.text     import Text
from rich          import box

sys.path.insert(0, str(Path(__file__).parent.parent))
from session.manager import (
    backup_session, restore_last_session, check_session_health,
    clean_old_backups, log_event, get_session_logs,
    AUTH_DIR, BACKUP_DIR,
)

console  = Console()
ROOT_DIR = Path(__file__).parent.parent.parent

# ─── Cargar .env del proyecto ─────────────────────────────────────────────────
def _load_env():
    env_file = ROOT_DIR / '.env'
    if not env_file.exists():
        return
    for line in env_file.read_text(encoding='utf-8').splitlines():
        line = line.strip()
        if line and not line.startswith('#') and '=' in line:
            k, _, v = line.partition('=')
            os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))

_load_env()

RUST_BASE   = os.getenv('SESSION_API_URL', 'http://127.0.0.1:3001')
RUST_APIKEY = os.getenv('SESSION_API_KEY', '')

SERVICES = {
    'FastAPI':  'http://127.0.0.1:5000/api/v1/health',
    'Rust API': f'{RUST_BASE}/health/live',
    'Webhook':  'http://127.0.0.1:4001/health',
    'PHP':      'http://127.0.0.1:8080',
}

# ─── HTTP helpers ─────────────────────────────────────────────────────────────

def _http_get(url: str, headers: dict = {}, timeout: float = 3.0) -> Optional[dict]:
    try:
        req = urllib.request.Request(url, method='GET')
        for k, v in headers.items():
            req.add_header(k, v)
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.loads(r.read().decode('utf-8'))
    except Exception:
        return None

def _http_post(url: str, data: dict = {}, headers: dict = {}, timeout: float = 5.0) -> Optional[dict]:
    try:
        body = json.dumps(data).encode('utf-8')
        req  = urllib.request.Request(url, data=body, method='POST')
        req.add_header('Content-Type', 'application/json')
        for k, v in headers.items():
            req.add_header(k, v)
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.loads(r.read().decode('utf-8'))
    except Exception:
        return None

def _rust(method: str, path: str, data: dict = {}) -> Optional[dict]:
    h = {'x-api-key': RUST_APIKEY}
    if method == 'GET':
        return _http_get(f'{RUST_BASE}{path}', headers=h)
    return _http_post(f'{RUST_BASE}{path}', data=data, headers=h)

# ─── Display helpers ──────────────────────────────────────────────────────────

def _ok(msg: str):   console.print(f'  [green]✔[/green]  {msg}')
def _warn(msg: str): console.print(f'  [yellow]⚠[/yellow]  {msg}')
def _err(msg: str):  console.print(f'  [red]✘[/red]  {msg}')
def _info(msg: str): console.print(f'  [dim]·[/dim]  {msg}')

def _title(text: str):
    console.print()
    console.print(f'  [bold cyan]── {text} ──[/bold cyan]')
    console.print()

def _section(text: str):
    console.print(f'  [bold white]{text}[/bold white]')

# ─── 1. STATUS ────────────────────────────────────────────────────────────────

def cmd_status():
    _title('Estado de servicios')

    table = Table(box=box.SIMPLE_HEAVY, show_header=True, header_style='bold dim', padding=(0, 2))
    table.add_column('Servicio',  width=12)
    table.add_column('Estado',    width=10)
    table.add_column('Detalle',   style='dim')

    for name, url in SERVICES.items():
        h = {'x-api-key': RUST_APIKEY} if 'Rust' in name else {}
        data = _http_get(url, headers=h)
        if data is not None:
            detail = ''
            if   'uptime'         in data: detail = f"uptime {data['uptime']}s"
            elif 'activeSessions' in data: detail = f"{data.get('activeSessions', 0)} sesiones"
            elif 'version'        in data: detail = f"v{data['version']}"
            table.add_row(name, '[green]online[/green]', detail or url)
        else:
            table.add_row(name, '[red]offline[/red]', url)

    console.print(table)

    # Sesión local
    _section('Sesión')
    health = check_session_health()
    if health['healthy']:
        name = health.get('name', '')
        jid  = health.get('jid', '').split('@')[0].split(':')[0]
        _ok(f'{name} (+{jid}) — {health.get("files", 0)} archivos en auth/')
    else:
        _err(f'Sesión no saludable: {health["reason"]}')

    # Archivos Signal
    if AUTH_DIR.exists():
        sfiles = list(AUTH_DIR.glob('session-*.json')) + list(AUTH_DIR.glob('sender-key-*.json'))
        if sfiles:
            _warn(f'{len(sfiles)} archivos Signal presentes (posible Bad MAC)')
        else:
            _ok('Sin archivos Signal')

    console.print()


# ─── 2. DIAGNOSE ─────────────────────────────────────────────────────────────

def cmd_diagnose():
    _title('Diagnóstico profundo')
    issues: list[tuple[str, str]] = []

    # ── Sesión local ──────────────────────────────────────────────────────────
    _section('Sesión local (auth/)')
    health = check_session_health()
    if health['healthy']:
        jid  = health.get('jid', '').split(':')[0]
        _ok(f'creds.json válido  →  {health.get("name", "?")} (+{jid.split("@")[0]})')
    else:
        _err(f'creds.json: {health["reason"]}')
        issues.append(('error', f'creds: {health["reason"]}'))

    if AUTH_DIR.exists():
        by_prefix: dict[str, int] = {}
        for f in AUTH_DIR.iterdir():
            if f.is_file():
                p = f.name.split('-')[0] if '-' in f.name else f.stem
                by_prefix[p] = by_prefix.get(p, 0) + 1
        for p, c in sorted(by_prefix.items()):
            color = 'red' if p in ('session', 'sender') else 'dim'
            console.print(f'    [{color}]{p}[/{color}] × {c}')
        sig_n = by_prefix.get('session', 0) + by_prefix.get('sender', 0)
        if sig_n:
            _warn(f'{sig_n} archivos Signal — fuente de Bad MAC')
            issues.append(('warn', f'{sig_n} archivos Signal en auth/'))
        else:
            _ok('Sin archivos Signal')
    else:
        _err('auth/ no existe')
        issues.append(('error', 'auth/ no existe'))

    # ── Rust Session API ──────────────────────────────────────────────────────
    console.print()
    _section('Rust Session API')
    rust_h = _rust('GET', '/health')
    if rust_h:
        _ok(f'online  v{rust_h.get("version", "?")}  ·  {rust_h.get("activeSessions", 0)} sesión(es)')
        mh = _rust('GET', '/healthy?sessionId=main')
        if mh:
            if mh.get('healthy'):
                _ok('creds "main" en Rust: saludable')
            else:
                _warn('creds "main" en Rust: corrupto/ausente')
                issues.append(('warn', 'creds en Rust dañados'))
            snap = mh.get('lastSnapshot')
            if snap:
                _info(f'último snapshot: {snap.get("ts","?")[:19]} ({snap.get("sizeBytes",0)} B)')
            else:
                _info('sin snapshots en Rust')
        else:
            _info('sesión "main" no encontrada en Rust (normal si no se guardó aún)')
    else:
        _warn('Rust API offline')
        issues.append(('warn', 'Rust API offline'))

    # ── FastAPI / Webhook ─────────────────────────────────────────────────────
    console.print()
    _section('FastAPI / Webhook')
    api = _http_get('http://127.0.0.1:5000/api/v1/health')
    if api: _ok('FastAPI online')
    else:
        _warn('FastAPI offline')
        issues.append(('warn', 'FastAPI offline'))

    wh = _http_get('http://127.0.0.1:4001/health')
    if wh:
        connected = wh.get('connected', False)
        lbl = '[green]socket ✓[/green]' if connected else '[yellow]socket desconectado[/yellow]'
        _ok(f'Webhook online  ·  {lbl}  ·  uptime {wh.get("uptime",0)}s')
        if not connected:
            issues.append(('warn', 'Node: socket WhatsApp desconectado'))
    else:
        _warn('Webhook offline (Node no está corriendo)')

    # ── Backups ───────────────────────────────────────────────────────────────
    console.print()
    _section('Backups de sesión')
    if BACKUP_DIR.exists():
        bs = sorted([b for b in BACKUP_DIR.iterdir() if b.is_dir() and not b.name.startswith('emergency')], reverse=True)
        if bs:
            _ok(f'{len(bs)} backup(s) — más reciente: {bs[0].name}')
            for b in bs[:3]:
                ck = '✔' if (b / 'checksums.json').exists() else '?'
                _info(f'{ck}  {b.name}')
        else:
            _warn('Sin backups disponibles')
            issues.append(('warn', 'sin backups'))
    else:
        _warn('Directorio de backups no existe')

    # ── Logs recientes ────────────────────────────────────────────────────────
    console.print()
    _section('Logs de sesión (últimos 8)')
    logs = get_session_logs()
    for entry in reversed(logs[-8:]) if logs else []:
        ts    = entry.get('timestamp', '')[:19].replace('T', ' ')
        ev    = entry.get('event', '')
        det   = entry.get('detail', '')[:55]
        st    = entry.get('status', 'success')
        color = 'red' if st == 'fail' else 'dim'
        console.print(f'  [{color}]{ts}  {ev:<20}  {det}[/{color}]')

    # ── Break Detector ────────────────────────────────────────────────────────
    console.print()
    _section('Break Detector')
    bl = ROOT_DIR / 'data' / 'break_log.json'
    if bl.exists():
        try:
            breaks = json.loads(bl.read_text(encoding='utf-8'))
            active = [b for b in breaks if not b.get('resolved', False)]
            if active:
                _warn(f'{len(active)} rotura(s) activa(s)')
                for b in active[:5]:
                    sev   = b.get('severity', '')
                    msg   = b.get('message', '')
                    color = 'red' if sev == 'critical' else 'yellow'
                    console.print(f'    [{color}]{sev:<10}[/{color}]  {msg}')
                issues.append(('warn', f'{len(active)} roturas activas'))
            else:
                _ok('Sin roturas activas')
        except Exception as e:
            _warn(f'No se pudo leer break_log.json: {e}')
    else:
        _info('break_log.json no encontrado')

    # ── Resumen ───────────────────────────────────────────────────────────────
    console.print()
    if not issues:
        console.print(Panel('[green bold]  Sistema saludable  [/green bold]', box=box.SIMPLE, padding=(0, 2)))
    else:
        lines = '\n'.join(
            f'  [{"red" if s == "error" else "yellow"}]{"✘" if s == "error" else "⚠"}[/]  {m}'
            for s, m in issues
        )
        console.print(Panel(lines, title='[bold]Problemas detectados[/bold]', box=box.SIMPLE))
        console.print()
        if Confirm.ask('  ¿Ejecutar reparación automática?', default=True):
            cmd_repair(silent=True)


# ─── 3. REPAIR ───────────────────────────────────────────────────────────────

def cmd_repair(silent: bool = False):
    if not silent:
        _title('Reparación automática')

    repaired = False

    # Paso 1: limpiar archivos Signal si existen
    if AUTH_DIR.exists():
        sfiles = list(AUTH_DIR.glob('session-*.json')) + list(AUTH_DIR.glob('sender-key-*.json'))
        if sfiles:
            _info(f'Encontrados {len(sfiles)} archivos Signal — intentando limpiar via Rust...')
            rust = _rust('POST', '/sessions/signal/clear')
            if rust and rust.get('ok'):
                _ok(f'Rust eliminó {rust.get("deleted", 0)} archivos Signal')
                repaired = True
            else:
                # fallback manual
                deleted = sum(1 for f in sfiles if _unlink_safe(f))
                _ok(f'{deleted} archivos Signal eliminados (manual)')
                repaired = True
        else:
            _ok('Sin archivos Signal')
    else:
        _err('auth/ no existe')

    # Paso 2: verificar creds.json
    health = check_session_health()
    if not health['healthy']:
        _warn(f'Sesión no válida: {health["reason"]}')
        # Intentar recuperar desde Rust snapshots
        rr = _rust('POST', '/recover', {'sessionId': 'main'})
        if rr and rr.get('ok'):
            _ok(f'Creds recuperados desde Rust: {rr.get("message", "")}')
            repaired = True
        else:
            _info('Sin snapshots en Rust — probando backup de Python...')
            if restore_last_session():
                _ok('Sesión restaurada desde backup Python')
                repaired = True
            else:
                _err('Sin backups válidos — necesitarás escanear QR nuevo')
                if Confirm.ask('  ¿Hacer reset + QR ahora?', default=False):
                    cmd_reset_qr()
                    return
    else:
        _ok('creds.json válido')

    if repaired:
        _ok('Reparación completada')
        log_event('repair', 'auto-repair ok')
    else:
        _info('Nada que reparar')

    console.print()


def _unlink_safe(path: Path) -> bool:
    try: path.unlink(); return True
    except Exception: return False


# ─── 4. RESET-SIGNAL ─────────────────────────────────────────────────────────

def cmd_reset_signal():
    _title('Limpiar sesiones Signal')

    if not AUTH_DIR.exists():
        _warn('auth/ no existe — nada que limpiar')
        return

    sfiles = list(AUTH_DIR.glob('session-*.json')) + list(AUTH_DIR.glob('sender-key-*.json'))
    if not sfiles:
        _ok('Sin archivos Signal presentes')
        return

    _info(f'{len(sfiles)} archivos a eliminar:')
    for f in sfiles[:6]:
        console.print(f'  [dim]  {f.name}[/dim]')
    if len(sfiles) > 6:
        _info(f'  ... y {len(sfiles) - 6} más')

    if not Confirm.ask(f'  ¿Eliminar {len(sfiles)} archivos Signal?', default=True):
        _info('Cancelado')
        return

    # Rust primero, fallback manual
    rust = _rust('POST', '/sessions/signal/clear')
    if rust and rust.get('ok'):
        _ok(f'Rust eliminó {rust.get("deleted", 0)} archivos Signal')
    else:
        deleted = sum(1 for f in sfiles if _unlink_safe(f))
        _ok(f'{deleted} archivos eliminados (manual)')

    log_event('reset_signal', f'{len(sfiles)} archivos Signal')
    _info('WhatsApp re-establecerá sesiones Signal automáticamente al recibir mensajes')
    console.print()


# ─── 5. RESET-QR ─────────────────────────────────────────────────────────────

def cmd_reset_qr():
    _title('Reset QR — nueva sesión')

    console.print('  [yellow bold]⚠  Esto eliminará la sesión actual.[/yellow bold]')
    console.print('  [dim]Tendrás que escanear el QR desde WhatsApp → Dispositivos vinculados.[/dim]')
    console.print()

    if not Confirm.ask('  ¿Confirmar reset completo?', default=False):
        _info('Cancelado')
        return

    # Backup de emergencia
    if check_session_health()['healthy']:
        _info('Creando backup de emergencia...')
        backup_session()

    # Eliminar auth/
    if AUTH_DIR.exists():
        shutil.rmtree(AUTH_DIR)
        _ok('auth/ eliminado')
    else:
        _info('auth/ ya no existe')

    # Preguntar si eliminar backups (para que el monitor no restaure la sesión vieja)
    if BACKUP_DIR.exists():
        also = Confirm.ask(
            '  ¿Eliminar backups también? (evita que el monitor restaure la sesión vieja)',
            default=True,
        )
        if also:
            shutil.rmtree(BACKUP_DIR)
            _ok('Backups eliminados')

    log_event('reset_qr', 'sesión eliminada para nuevo QR')
    console.print()
    _ok('Iniciando Node directamente para QR (bypass del monitor)...')
    console.print('  [dim]Escanea el QR → WhatsApp → ⋮ → Dispositivos vinculados → Vincular dispositivo[/dim]')
    console.print()

    try:
        subprocess.run(['npm.cmd', 'run', 'dev'], cwd=str(ROOT_DIR))
    except KeyboardInterrupt:
        console.print()
        _info('Detenido')


# ─── 6. BACKUP ───────────────────────────────────────────────────────────────

def cmd_backup():
    _title('Backup manual de sesión')
    if backup_session():
        _ok('Backup completado')
        clean_old_backups(keep=5)
    else:
        _err('Backup fallido — ¿sesión válida?')
    console.print()


# ─── 7. RESTORE ──────────────────────────────────────────────────────────────

def cmd_restore():
    _title('Restaurar desde backup')

    if not BACKUP_DIR.exists():
        _err('No hay directorio de backups')
        return

    bs = sorted(
        [b for b in BACKUP_DIR.iterdir() if b.is_dir() and not b.name.startswith('emergency')],
        reverse=True,
    )
    if not bs:
        _err('No hay backups disponibles')
        return

    table = Table(box=box.SIMPLE, show_header=True, header_style='bold dim', padding=(0, 2))
    table.add_column('#',        width=4,  style='dim')
    table.add_column('Backup',   width=28)
    table.add_column('Archivos', width=9)
    table.add_column('Checksums')

    for i, b in enumerate(bs[:10], 1):
        n    = len(list(b.iterdir()))
        has  = (b / 'checksums.json').exists()
        lbl  = '[green]✔[/green]' if has else '[yellow]?[/yellow]'
        table.add_row(str(i), b.name, str(n), lbl)

    console.print(table)

    choice = Prompt.ask('  Número (Enter = más reciente)', default='1')
    try:
        idx = int(choice) - 1
        if not 0 <= idx < len(bs):
            _err('Número inválido'); return
    except ValueError:
        _err('Número inválido'); return

    selected = bs[idx]
    if not Confirm.ask(f'  ¿Restaurar {selected.name}?', default=True):
        _info('Cancelado'); return

    if check_session_health()['healthy']:
        _info('Guardando estado actual como emergencia...')
        backup_session()

    if AUTH_DIR.exists():
        shutil.rmtree(AUTH_DIR)

    try:
        shutil.copytree(selected, AUTH_DIR)
        nh = check_session_health()
        if nh['healthy']:
            jid = nh.get('jid', '').split(':')[0].split('@')[0]
            _ok(f'Sesión restaurada: {nh.get("name","?")} (+{jid})')
            log_event('restore_manual', selected.name)
        else:
            _err(f'Sesión restaurada no válida: {nh["reason"]}')
    except Exception as e:
        _err(f'Error restaurando: {e}')

    console.print()


# ─── 8. LOGS ─────────────────────────────────────────────────────────────────

def cmd_logs():
    _title('Logs de sesión')
    logs = get_session_logs()
    if not logs:
        _info('Sin logs disponibles'); return

    table = Table(box=box.SIMPLE, show_header=True, header_style='bold dim', padding=(0, 2))
    table.add_column('Hora',    width=20, style='dim')
    table.add_column('Evento',  width=24)
    table.add_column('Detalle', style='dim')
    table.add_column('Estado',  width=8)

    for e in reversed(logs[-30:]):
        ts    = e.get('timestamp', '')[:19].replace('T', ' ')
        ev    = e.get('event', '')
        det   = e.get('detail', '')[:50]
        st    = e.get('status', 'success')
        label = '[green]ok[/green]' if st == 'success' else '[red]fail[/red]'
        table.add_row(ts, ev, det, label)

    console.print(table)
    console.print()


# ─── Menú interactivo ─────────────────────────────────────────────────────────

COMMANDS = [
    ('1', 'status',       'Estado de servicios',                cmd_status),
    ('2', 'diagnose',     'Diagnóstico profundo',               cmd_diagnose),
    ('3', 'repair',       'Reparación automática',              lambda: cmd_repair(silent=False)),
    ('4', 'reset-signal', 'Limpiar sesiones Signal (Bad MAC)',  cmd_reset_signal),
    ('5', 'reset-qr',     'Reset completo + nuevo QR',          cmd_reset_qr),
    ('6', 'backup',       'Forzar backup de sesión',            cmd_backup),
    ('7', 'restore',      'Restaurar desde backup',             cmd_restore),
    ('8', 'logs',         'Ver logs recientes',                 cmd_logs),
]

def _print_menu():
    console.print()
    console.print('  [bold cyan]WinsiBot Manager[/bold cyan]')
    console.print()
    for key, cmd, label, _ in COMMANDS:
        console.print(f'  [yellow]{key}[/yellow]  [white]{label}[/white]  [dim]({cmd})[/dim]')
    console.print()
    console.print('  [dim]q  Salir[/dim]')
    console.print()

def interactive_menu():
    while True:
        _print_menu()
        choice = Prompt.ask('  Opción', default='1')
        if choice.lower() in ('q', 'quit', 'exit', '0'):
            break
        match = next((fn for k, cmd, _, fn in COMMANDS if choice in (k, cmd)), None)
        if match:
            match()
        else:
            _err(f'Opción "{choice}" no válida')


# ─── Entry point ─────────────────────────────────────────────────────────────

def main():
    if len(sys.argv) < 2:
        interactive_menu()
        return

    arg = sys.argv[1].lower()
    match = next((fn for k, cmd, _, fn in COMMANDS if arg in (k, cmd)), None)
    if match:
        match()
        return

    _err(f'Comando desconocido: {arg}')
    console.print()
    console.print('  Comandos disponibles:')
    for _, cmd, label, _ in COMMANDS:
        console.print(f'  [yellow]{cmd:<16}[/yellow]  [dim]{label}[/dim]')
    console.print()
    sys.exit(1)


if __name__ == '__main__':
    main()
