import subprocess
import sys
import re
import os
import time
import threading
import signal
from pathlib import Path
from datetime import datetime
# ─── Salida en UTF-8 ──────────────────────────────────────────────────────────
#
# En Windows la consola arranca con una codepage heredada (cp1252 en español),
# y `rich` cae ahí a su renderizador legacy: al escribir cualquiera de sus
# símbolos lanza UnicodeEncodeError y la herramienta muere antes de mostrar
# nada. Reconfigurar la salida lo evita, y `errors='replace'` cubre el caso
# del terminal que de verdad no puede con un carácter: mejor un signo raro
# que un traceback.
#
# Va antes de crear la Console de rich: ahí es donde decide cómo renderiza.
for _flujo in (sys.stdout, sys.stderr):
    if _flujo is not None and hasattr(_flujo, 'reconfigure'):
        try:
            _flujo.reconfigure(encoding='utf-8', errors='replace')
        except Exception:
            pass

from rich.console import Console

sys.path.insert(0, str(Path(__file__).parent.parent))
from session.manager import (
    backup_session, restore_last_session,
    check_session_health, clean_old_backups, log_event
)
from ai.break_detector import analyze_line
from paths import ROOT

console  = Console()
ROOT_DIR = ROOT

NODE_CMD         = ["npm.cmd", "run", "dev"]
RESTART_DELAY    = 10
MAX_RESTARTS     = 10
HANG_TIMEOUT     = 900   # 15 min sin output → kill (WhatsApp puede estar quieto mucho tiempo)
RESPONSE_TIMEOUT = 90    # 90s para respuesta de comando (descargas, AI, etc.)

restart_count      = 0
last_output_time   = time.time()
last_command_time  = 0.0
last_response_time = 0.0
process:           subprocess.Popen | None = None
warned_hang        = False
warned_no_response = False
session_expelled   = False

SUPPRESS_PATTERNS = [
    # ── crypto / signal protocol ─────────────────────────────────────────────
    'Bad MAC', 'Failed to decrypt', 'Session error',
    'verifyMAC', 'decryptWhisperMessage', 'decryptWithSessions',
    'asyncQueueExecutor', 'libsignal',
    'Closing open session', 'Closing session', 'SessionEntry',
    '_chains', 'registrationId', 'currentRatchet', 'ephemeralKeyPair',
    'lastRemoteEphemeralKey', 'previousCounter', 'rootKey', 'indexInfo',
    'baseKey', 'baseKeyType', 'remoteIdentityKey', 'pendingPreKey',
    'processTicksAndRejections', 'pubKey', 'privKey', 'chainKey',
    'chainType', 'messageKeys', 'signedKeyId', 'preKeyId',
    'Exception in thread',
    # ── store JSON Baileys ───────────────────────────────────────────────────
    '"msgCount":', '"unreadMentionCount":', '"conversationTimestamp":',
    '"tcToken":', '"tcTokenTimestamp":', '"tcTokenSenderTimestamp":',
    '"implicitlyCreatedAt":', '"pnJid":', '"lid":', '"disappearingMode"',
    '"ephemeralExpiration":', '"ephemeralSettingTimestamp":',
    '"communityAnnounceLid":', '"markedAsUnread":', '"readOnly":',
    '"lastMsgTimestamp":', '"lastMsgObj":', '"pinned":', '"muteExpiration":',
    '"notSpam":', '"shareOwnPn":', '"pnhDupeDetectionDisabled":',
    '"linkedParent":', '"newJid":', '"oldJid":', '"deviceSentMeta":',
    '"participant":', '"messageStubParameters":', '"ignore":',
    '"starred":', '"broadcast":', '"pushName":', '"mediaCiphertextSha256":',
    '"duration":', '"pageCount":', '"viewOnce":', '"isAnimated":',
]

_BAILEYS_STORE_RE = re.compile(r'^\s*(closed|used|created):')

# ─── Helpers ──────────────────────────────────────────────────────────────────
def log(msg: str):
    t = datetime.now().strftime("%H:%M:%S")
    console.print(f"  [dim]{t}[/dim]  {msg}")

def should_suppress(text: str) -> bool:
    stripped = text.strip()
    if stripped in ('{', '}', '},', '};', '[', ']', '],', '});', '})'):
        return True
    if stripped.isdigit():
        return True
    if _BAILEYS_STORE_RE.match(text):
        return True
    return any(p in stripped for p in SUPPRESS_PATTERNS)

def find_python() -> str:
    venv = ROOT_DIR / "python" / "venv" / "Scripts" / "python.exe"
    if venv.exists():
        return str(venv)
    return sys.executable

# La API de Python se arrancaba y se esperaba acá.
#
# Desde la 8.11.0 no queda nada que servir: los tres comandos de imagen —lo
# último que vivía allá— están en rust/src/vision.rs, y la API se había
# quedado con un solo endpoint, GET /health, que solo consultaban este archivo
# y manage.py. Un servicio cuyo único trabajo era responder que estaba vivo.

# ─── Watchdog ─────────────────────────────────────────────────────────────────
def watchdog():
    global process, last_output_time, warned_hang, warned_no_response
    global last_command_time, last_response_time, session_expelled
    while True:
        time.sleep(5)
        if process and process.poll() is None:
            if session_expelled:
                continue

            elapsed = time.time() - last_output_time

            if elapsed > HANG_TIMEOUT and not warned_hang:
                warned_hang = True
                log(f"[yellow]§ Node sin respuesta por {int(elapsed)}s — reiniciando...[/yellow]")
                log_event("hang_restart", f"{int(elapsed)}s sin output")
                alert_from_watchdog("hang_restart", f"{int(elapsed)}s sin output")
                process.kill()
                continue

            if last_command_time > 0:
                no_response = time.time() - last_response_time
                if no_response > RESPONSE_TIMEOUT and not warned_no_response:
                    warned_no_response = True
                    log(f"[yellow]§ Comando sin respuesta por {int(no_response)}s — reiniciando...[/yellow]")
                    log_event("no_response_restart", f"{int(no_response)}s sin respuesta")
                    alert_from_watchdog("no_response_restart", f"{int(no_response)}s sin respuesta")
                    last_command_time  = 0.0
                    last_response_time = 0.0
                    process.kill()

# ─── Streams ──────────────────────────────────────────────────────────────────
def stream_output(proc: subprocess.Popen):
    global last_output_time, last_command_time, last_response_time, session_expelled
    assert proc.stdout
    for line in iter(proc.stdout.readline, b''):
        last_output_time = time.time()
        text = line.decode('utf-8', errors='replace').rstrip()
        if not text:
            continue

        # detectar expulsion 440
        if 'expulsada por otra instancia' in text or 'Sesion expulsada' in text:
            session_expelled = True
            log("[red]§ Sesion expulsada (440) — cierra WhatsApp Web[/red]")
            log_event("expelled_440")
            alert_from_watchdog("expelled_440")

        # detectar comando ejecutado
        if 'Comando ejecutado' in text:
            last_command_time  = time.time()
            last_response_time = time.time()

        if last_command_time > 0:
            last_response_time = time.time()

        # reset expulsion al conectar exitoso
        if 'esperando mensajes' in text:
            session_expelled = False
            log_event("connected")

        if should_suppress(text):
            log_event("suppress", text[:120])
            continue

        # ─── break detector en tiempo real ───────────────────────────────────
        try:
            breaks = analyze_line(text)
            for b in breaks:
                log(f"[red]§ ROTURA DETECTADA: {b.message}[/red]")
                log(f"[dim]  → {b.suggested_fix}[/dim]")
        except Exception:
            pass

        sys.stdout.write(text + '\n')
        sys.stdout.flush()

def stream_stderr(proc: subprocess.Popen):
    assert proc.stderr
    for line in iter(proc.stderr.readline, b''):
        text = line.decode('utf-8', errors='replace').rstrip()
        if not text:
            continue
        if should_suppress(text):
            log_event("suppress_stderr", text[:120])
            continue

        # ─── break detector en stderr también ────────────────────────────────
        try:
            breaks = analyze_line(text)
            for b in breaks:
                log(f"[red]§ ROTURA DETECTADA: {b.message}[/red]")
                log(f"[dim]  → {b.suggested_fix}[/dim]")
        except Exception:
            pass

        console.print(f"  [red]{text}[/red]")

# ─── Node ─────────────────────────────────────────────────────────────────────
def start_node() -> subprocess.Popen:
    global warned_hang, warned_no_response, session_expelled
    global last_output_time, last_command_time, last_response_time
    warned_hang        = False
    warned_no_response = False
    session_expelled   = False
    last_output_time   = time.time()
    last_command_time  = 0.0
    last_response_time = 0.0
    return subprocess.Popen(
        NODE_CMD,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        cwd=str(ROOT_DIR),
        env={**os.environ, "FORCE_COLOR": "1"},
    )

# ─── AI ───────────────────────────────────────────────────────────────────────
def alert_from_watchdog(event: str, detail: str = '') -> None:
    try:
        from ai.alert_system import alert_from_watchdog as _alert
        _alert(event, detail)
    except Exception:
        pass

def start_health_monitor():
    # Cada servicio en su propio try.
    #
    # Antes los dos imports y los dos arranques estaban en el MISMO bloque, y
    # el de ai_brain iba segundo: si fallaba —por un modelo corrupto, por
    # numpy ausente en una compilación recortada, por lo que sea— la excepción
    # saltaba antes de `start_background(interval=30)` y el Health Monitor
    # **nunca arrancaba, en silencio**. Dos cosas distintas no comparten
    # try/except.
    try:
        from ai.health_monitor import start_background
        start_background(interval=30)
        log("[cyan]§ Health Monitor iniciado[/cyan]")
    except Exception as e:
        log(f"[yellow]§ Health Monitor no disponible: {e}[/yellow]")

    # El detector de anomalías necesita numpy y scikit-learn, que son las dos
    # dependencias pesadas de todo el proyecto. Sin ellas el resto del
    # watchdog funciona igual.
    try:
        from ai.ai_brain import brain as ai_brain
        ai_brain.start_background(interval=60)
        log("[cyan]§ AI Brain iniciado[/cyan]")
    except Exception as e:
        log(f"[dim]§ AI Brain no disponible: {e}[/dim]")

    try:

        # ─── breaks y code analysis en background — no bloquear arranque ──
        def _deferred_checks():
            import time
            time.sleep(15)
            try:
                from ai.break_detector import run_once as break_check, print_break_report
                report = break_check()
                if report.total > 0:
                    print_break_report(report)
            except Exception:
                pass
            try:
                from ai.code_analyzer import run_once as code_check, print_analysis
                analysis = code_check()
                if analysis.total > 0:
                    print_analysis(analysis)
            except Exception:
                pass

        import threading
        threading.Thread(target=_deferred_checks, daemon=True, name='DeferredChecks').start()

    except Exception as e:
        log(f"[yellow]§ Health Monitor no pudo iniciar: {e}[/yellow]")
        
# ─── Exit ─────────────────────────────────────────────────────────────────────
def handle_exit(sig, frame):
    log("[yellow]◆ WinsiBot detenido[/yellow]")
    log_event("shutdown", "manual SIGINT")
    alert_from_watchdog("shutdown")
    backup_session()
    if process:
        try:
            process.kill()
        except Exception:
            pass
    sys.exit(0)

signal.signal(signal.SIGINT,  handle_exit)
signal.signal(signal.SIGTERM, handle_exit)

# ─── Main ─────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    console.print()

    py = find_python()
    log(f"[dim]Python: {py}[/dim]")

    # 1. iniciar servicios en paralelo
    service_threads = [
        threading.Thread(target=start_health_monitor, daemon=True, name='SvcHealth'),
    ]
    for t in service_threads:
        t.start()
    for t in service_threads:
        t.join(timeout=3)


    # 2. verificar sesion
    health = check_session_health()
    if not health["healthy"]:
        log(f"[yellow]§ Sesion no saludable: {health['reason']}[/yellow]")
        restored = restore_last_session()
        if restored:
            log("[cyan]↩ Sesion restaurada desde backup[/cyan]")
        else:
            log("[yellow]§ Sin backup — se generara QR nuevo[/yellow]")
    else:
        log(f"[green]✔ Sesion OK ({health.get('files', 0)} archivos)[/green]")
        backup_session()
        clean_old_backups(keep=5)

    console.print()

    # 3. iniciar watchdog
    threading.Thread(target=watchdog, daemon=True).start()

    # 4. loop principal
    while restart_count <= MAX_RESTARTS:
        if restart_count == 0:
            log("[cyan]◆ Iniciando WinsiBot...[/cyan]")
        else:
            log(f"[cyan]◆ Iniciando WinsiBot... (intento {restart_count + 1})[/cyan]")
            health = check_session_health()
            if not health["healthy"]:
                log(f"[yellow]§ Sesion corrupta ({health['reason']}) — restaurando...[/yellow]")
                restore_last_session()

        process = start_node()

        t_out = threading.Thread(target=stream_output, args=(process,), daemon=True)
        t_err = threading.Thread(target=stream_stderr, args=(process,), daemon=True)
        t_out.start()
        t_err.start()

        exit_code = process.wait()
        t_out.join(timeout=2)
        t_err.join(timeout=2)

        if exit_code == 0:
            log("[green]✔ Proceso terminado limpiamente[/green]")
            log_event("clean_exit")
            alert_from_watchdog("clean_exit")
            backup_session()
            break

        restart_count += 1

        if restart_count > MAX_RESTARTS:
            log(f"[red]✘ Maximo de reinicios ({MAX_RESTARTS}) alcanzado — deteniendo[/red]")
            log_event("max_restarts")
            alert_from_watchdog("max_restarts")
            sys.exit(1)

        if session_expelled:
            log("[yellow]§ Expulsado (440) — esperando 60s...[/yellow]")
            log("[yellow]§ Asegurate de cerrar WhatsApp Web en el navegador[/yellow]")
            log_event("expelled_wait")
            time.sleep(60)
        elif not warned_hang and not warned_no_response:
            log(f"[yellow]§ Proceso caido (codigo {exit_code}) — reiniciando en {RESTART_DELAY}s...[/yellow]")
            log_event("crash_restart", f"exit code {exit_code}")
            alert_from_watchdog("crash_restart", f"exit code {exit_code}")
            time.sleep(RESTART_DELAY)
        else:
            time.sleep(RESTART_DELAY)