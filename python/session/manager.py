import json
import shutil
import hashlib
from pathlib import Path
from datetime import datetime
from rich.console import Console

console = Console()

# ─── Paths absolutos desde la raiz del proyecto ───────────────────────────────
_ROOT      = Path(__file__).parent.parent.parent
AUTH_DIR   = _ROOT / 'auth'
BACKUP_DIR = _ROOT / 'data' / 'session_backups'
LOG_FILE   = _ROOT / 'data' / 'session_log.json'

# archivos criticos a validar (mejora 1 — no SHA256 a todo)
CRITICAL_FILES = ["creds.json", "app-state-sync-key-*.json"]

# ─── Log ──────────────────────────────────────────────────────────────────────
def log_event(event: str, detail: str = "", status: str = "success"):
    """Mejora 3 — logs con status success | fail"""
    try:
        BACKUP_DIR.mkdir(parents=True, exist_ok=True)
        logs = []
        if LOG_FILE.exists():
            try:
                logs = json.loads(LOG_FILE.read_text(encoding='utf-8'))
            except Exception:
                logs = []
        logs.append({
            "event":     event,
            "detail":    detail,
            "status":    status,
            "timestamp": datetime.utcnow().isoformat(),
        })
        logs = logs[-100:]
        LOG_FILE.write_text(
            json.dumps(logs, indent=2, ensure_ascii=False),
            encoding='utf-8',
        )
    except Exception:
        pass

# ─── Checksum solo archivos criticos (mejora 1) ───────────────────────────────
def _file_checksum(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(8192), b''):
            h.update(chunk)
    return h.hexdigest()

def _get_critical_files(base: Path) -> list[Path]:
    """Solo valida creds.json y keys — no SHA256 a todo"""
    files = []
    creds = base / "creds.json"
    if creds.exists():
        files.append(creds)
    # app-state keys
    for f in base.glob("app-state-sync-key-*.json"):
        files.append(f)
    # pre-key store
    for f in base.glob("pre-key-*.json"):
        files.append(f)
    return files

def _write_checksums(backup_path: Path):
    """Checksum solo de archivos criticos"""
    checksums = {}
    for f in _get_critical_files(backup_path):
        relative = str(f.relative_to(backup_path))
        checksums[relative] = _file_checksum(f)
    checksum_file = backup_path / 'checksums.json'
    checksum_file.write_text(json.dumps(checksums, indent=2), encoding='utf-8')

def _verify_checksums(backup_path: Path) -> tuple[bool, str]:
    """Verifica solo archivos criticos"""
    checksum_file = backup_path / 'checksums.json'
    if not checksum_file.exists():
        return False, "checksums.json no encontrado"
    try:
        expected = json.loads(checksum_file.read_text(encoding='utf-8'))
    except Exception:
        return False, "checksums.json corrupto"
    if not expected:
        return False, "checksums vacio"
    for relative, expected_hash in expected.items():
        file_path = backup_path / relative
        if not file_path.exists():
            return False, f"archivo critico faltante: {relative}"
        actual = _file_checksum(file_path)
        if actual != expected_hash:
            return False, f"checksum invalido: {relative}"
    return True, "ok"

# ─── Validacion profunda ──────────────────────────────────────────────────────
def check_session_health() -> dict:
    if not AUTH_DIR.exists():
        return {"healthy": False, "reason": "auth dir missing"}

    files = list(AUTH_DIR.iterdir())
    if not files:
        return {"healthy": False, "reason": "auth dir empty"}

    creds = AUTH_DIR / "creds.json"
    if not creds.exists():
        return {"healthy": False, "reason": "creds.json missing"}

    try:
        data = json.loads(creds.read_text(encoding='utf-8'))
    except Exception:
        return {"healthy": False, "reason": "creds.json corrupt"}

    if not data.get("me"):
        return {"healthy": False, "reason": "campo 'me' ausente"}
    if not data["me"].get("id"):
        return {"healthy": False, "reason": "campo 'me.id' ausente"}
    if not data.get("noiseKey"):
        return {"healthy": False, "reason": "campo 'noiseKey' ausente"}
    if not data.get("signedIdentityKey"):
        return {"healthy": False, "reason": "campo 'signedIdentityKey' ausente"}
    if not data.get("registrationId"):
        return {"healthy": False, "reason": "campo 'registrationId' ausente"}

    return {
        "healthy": True,
        "files":   len(files),
        "jid":     data["me"].get("id", ""),
        "name":    data["me"].get("name", ""),
    }

# ─── Backup ───────────────────────────────────────────────────────────────────
def backup_session() -> bool:
    if not AUTH_DIR.exists():
        return False

    health = check_session_health()
    if not health["healthy"]:
        console.print(f"  [yellow]⚠ Sesion invalida, no se hara backup: {health['reason']}[/yellow]")
        log_event("backup_skipped", health["reason"], status="fail")
        return False

    ts   = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    dest = BACKUP_DIR / f"session_{ts}"

    try:
        BACKUP_DIR.mkdir(parents=True, exist_ok=True)
        shutil.copytree(AUTH_DIR, dest)
        _write_checksums(dest)

        ok, reason = _verify_checksums(dest)
        if not ok:
            console.print(f"  [red]✘ Backup invalido: {reason}[/red]")
            shutil.rmtree(dest, ignore_errors=True)
            log_event("backup", reason, status="fail")
            return False

        log_event("backup", str(dest), status="success")
        console.print(f"  [green]✔[/green] Sesion respaldada [dim]{dest.name}[/dim]")
        return True

    except Exception as e:
        console.print(f"  [red]✘ Error en backup: {e}[/red]")
        shutil.rmtree(dest, ignore_errors=True)
        log_event("backup", str(e), status="fail")
        return False

# ─── Restore con auto-reparacion (mejora 4) ───────────────────────────────────
def restore_last_session() -> bool:
    """
    Flujo de auto-reparacion completo:
    1. Busca backup valido con checksum OK
    2. Hace backup de emergencia antes de borrar
    3. Restaura y valida
    4. Si falla — revierte al emergency
    """
    if not BACKUP_DIR.exists():
        log_event("restore", "BACKUP_DIR no existe", status="fail")
        return False

    # mejora 2 — filtrar solo dirs (is_dir ya excluye checksums.json)
    backups = sorted(
        [b for b in BACKUP_DIR.iterdir() if b.is_dir() and not b.name.startswith('emergency')],
        reverse=True
    )

    if not backups:
        log_event("restore", "sin backups disponibles", status="fail")
        return False

    # buscar backup con integridad valida
    valid_backup = None
    for backup in backups:
        ok, reason = _verify_checksums(backup)
        if ok:
            valid_backup = backup
            break
        console.print(f"  [yellow]⚠ Backup {backup.name} invalido: {reason}[/yellow]")

    if not valid_backup:
        console.print("  [red]✘ Ningun backup valido encontrado[/red]")
        log_event("restore", "sin backups validos", status="fail")
        return False

    emergency = None
    try:
        # backup de emergencia antes de borrar
        if AUTH_DIR.exists():
            emergency = BACKUP_DIR / f"emergency_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}"
            shutil.copytree(AUTH_DIR, emergency)
            shutil.rmtree(AUTH_DIR)

        shutil.copytree(valid_backup, AUTH_DIR)

        # verificar sesion restaurada
        health = check_session_health()
        if not health["healthy"]:
            console.print(f"  [red]✘ Sesion restaurada no valida: {health['reason']}[/red]")
            # revertir al emergency
            if emergency and emergency.exists():
                shutil.rmtree(AUTH_DIR, ignore_errors=True)
                shutil.copytree(emergency, AUTH_DIR)
                console.print("  [yellow]↩ Revertido al estado anterior[/yellow]")
            log_event("restore", health["reason"], status="fail")
            return False

        log_event("restore", str(valid_backup), status="success")
        console.print(f"  [cyan]↩[/cyan] Sesion restaurada [dim]{valid_backup.name}[/dim]")
        return True

    except Exception as e:
        console.print(f"  [red]✘ Error restaurando: {e}[/red]")
        if emergency and emergency.exists():
            shutil.rmtree(AUTH_DIR, ignore_errors=True)
            shutil.copytree(emergency, AUTH_DIR)
        log_event("restore", str(e), status="fail")
        return False

# ─── Limpieza ─────────────────────────────────────────────────────────────────
def clean_old_backups(keep: int = 5):
    if not BACKUP_DIR.exists():
        return
    backups = sorted(
        [b for b in BACKUP_DIR.iterdir() if b.is_dir() and not b.name.startswith('emergency')],
        reverse=True
    )
    for old in backups[keep:]:
        shutil.rmtree(old, ignore_errors=True)
        console.print(f"  [dim]🗑 Backup eliminado: {old.name}[/dim]")

def get_session_logs() -> list:
    if not LOG_FILE.exists():
        return []
    try:
        return json.loads(LOG_FILE.read_text(encoding='utf-8'))
    except Exception:
        return []