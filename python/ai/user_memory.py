"""
WinsiBot — User Memory
Aprende cómo habla cada usuario y adapta el comportamiento del bot
"""

import json
import threading
from pathlib import Path
from datetime import datetime, timedelta
from dataclasses import dataclass, asdict, field
from typing import Optional

DATA_DIR  = Path(__file__).parent.parent.parent / 'data' / 'ai' / 'users'
DATA_DIR.mkdir(parents=True, exist_ok=True)

# ─── Perfil de usuario ────────────────────────────────────────────────────────
@dataclass
class UserProfile:
    jid:              str
    # estilo de habla — solo lo que necesita la moderación/personalización;
    # vocabulario/largo/emojis completos viven en trainer.py (Parquet+DuckDB)
    uses_slang:       bool  = False
    # comportamiento
    insult_count:     int   = 0
    spam_count:       int   = 0
    nsfw_count:       int   = 0
    command_count:    int   = 0
    msg_count:        int   = 0
    # intenciones frecuentes
    top_intents:      dict  = field(default_factory=dict)
    # actividad
    first_seen:       str   = ''
    last_seen:        str   = ''
    active_hours:     list  = field(default_factory=list)   # [0-23]
    # reputación
    reputation:       str   = 'normal'    # trusted | normal | suspicious | toxic
    reputation_score: float = 50.0        # 0-100
    # preferencia de respuesta (derivada de las intenciones frecuentes, no del estilo)
    response_style:   str   = 'neutral'   # friendly | sarcastic | formal | humor
    # historial comprimido
    recent_intents:   list  = field(default_factory=list)   # últimas 20 intenciones
    updated_at:       str   = ''

# ─── Patrones de estilo ───────────────────────────────────────────────────────
_SLANG = {
    'xd', 'jaja', 'jeje', 'lol', 'we', 'wey', 'bro', 'men',
    'oe', 'pe', 'causa', 'pata', 'ctm', 'wtf', 'omg', 'gg',
    'uwu', 'owo', 'sksksk', 'ntp', 'nmms', 'nel', 'simon',
}

def _detect_style(text: str) -> dict:
    """Detecta características de estilo en un mensaje"""
    words   = text.lower().split()
    slang_c = sum(1 for w in words if w in _SLANG)

    return {
        'has_slang': slang_c > 0,
        'words':     words,
    }

def _calc_reputation(profile: UserProfile) -> tuple[float, str]:
    """
    Calcula reputación 0-100 basada en comportamiento.
    Aprende con cada mensaje.
    """
    score = 50.0

    # bonuses
    if profile.msg_count > 50:   score += 5
    if profile.msg_count > 200:  score += 10
    if profile.command_count > 20: score += 5

    # penalizaciones
    total = max(profile.msg_count, 1)
    insult_rate = profile.insult_count / total
    spam_rate   = profile.spam_count   / total
    nsfw_rate   = profile.nsfw_count   / total

    score -= insult_rate * 40
    score -= spam_rate   * 30
    score -= nsfw_rate   * 20

    score = max(0.0, min(100.0, score))

    if score >= 80:
        rep = 'trusted'
    elif score >= 50:
        rep = 'normal'
    elif score >= 25:
        rep = 'suspicious'
    else:
        rep = 'toxic'

    return round(score, 1), rep

def _infer_response_style(profile: UserProfile) -> str:
    """
    Infiere qué estilo de respuesta prefiere el usuario
    basándose en su comportamiento y lenguaje.
    """
    if profile.reputation in ('toxic', 'suspicious'):
        return 'sarcastic'

    intents  = profile.top_intents
    joke_c   = intents.get('joke', 0)
    praise_c = intents.get('praise', 0)
    comp_c   = intents.get('complaint', 0)

    if joke_c > comp_c and joke_c > 3:
        return 'humor'
    if praise_c > 3:
        return 'friendly'
    if comp_c > joke_c and comp_c > 3:
        return 'formal'
    if profile.uses_slang:
        return 'humor'

    return 'neutral'

# ─── Storage ──────────────────────────────────────────────────────────────────
_cache:  dict[str, UserProfile] = {}
_lock:   threading.Lock         = threading.Lock()
_dirty:  set[str]               = set()

def _profile_path(jid: str) -> Path:
    safe = jid.replace('@', '_').replace('.', '_').replace(':', '_')
    return DATA_DIR / f'{safe}.json'

def _load_profile(jid: str) -> UserProfile:
    with _lock:
        if jid in _cache:
            return _cache[jid]
        path = _profile_path(jid)
        if path.exists():
            try:
                data    = json.loads(path.read_text())
                profile = UserProfile(**{
                    k: v for k, v in data.items()
                    if k in UserProfile.__dataclass_fields__
                })
                _cache[jid] = profile
                return profile
            except Exception:
                pass
        profile     = UserProfile(jid=jid, first_seen=datetime.utcnow().isoformat())
        _cache[jid] = profile
        return profile

def _save_profile(jid: str) -> None:
    profile = _cache.get(jid)
    if not profile:
        return
    try:
        _profile_path(jid).write_text(json.dumps(asdict(profile), indent=2))
        _dirty.discard(jid)
    except Exception:
        pass

def _flush_dirty() -> None:
    """Guarda todos los perfiles modificados"""
    with _lock:
        for jid in list(_dirty):
            _save_profile(jid)

# ─── API principal ────────────────────────────────────────────────────────────
def update(
    jid:    str,
    text:   str,
    intent: str,
    is_cmd: bool = False,
) -> UserProfile:
    """
    Actualiza el perfil del usuario con cada mensaje.
    Aprende estilo, intención, comportamiento.
    """
    profile = _load_profile(jid)
    now     = datetime.utcnow()
    style   = _detect_style(text)

    # ─── contadores básicos ───────────────────────────────────────────────
    profile.msg_count += 1
    profile.last_seen  = now.isoformat()
    if not profile.first_seen:
        profile.first_seen = now.isoformat()

    # ─── hora activa ──────────────────────────────────────────────────────
    hour = now.hour
    if hour not in profile.active_hours:
        profile.active_hours.append(hour)
        profile.active_hours = sorted(profile.active_hours)

    # ─── jerga ──────────────────────────────────────────────────────────
    if style['has_slang']: profile.uses_slang = True

    # ─── intenciones ──────────────────────────────────────────────────────
    profile.top_intents[intent] = profile.top_intents.get(intent, 0) + 1

    # historial reciente comprimido
    profile.recent_intents.append(intent)
    profile.recent_intents = profile.recent_intents[-20:]

    # ─── comportamiento ───────────────────────────────────────────────────
    if intent == 'insult':  profile.insult_count += 1
    if intent == 'spam':    profile.spam_count   += 1
    if intent == 'nsfw':    profile.nsfw_count   += 1
    if is_cmd:              profile.command_count += 1

    # ─── reputación ───────────────────────────────────────────────────────
    profile.reputation_score, profile.reputation = _calc_reputation(profile)

    # ─── estilo de respuesta ──────────────────────────────────────────────
    profile.response_style = _infer_response_style(profile)

    profile.updated_at = now.isoformat()

    # marcar como sucio para flush
    with _lock:
        _dirty.add(jid)

    # flush cada 10 mensajes o si es importante
    if profile.msg_count % 10 == 0 or intent in ('insult', 'spam', 'nsfw'):
        _save_profile(jid)

    return profile

def get(jid: str) -> UserProfile:
    """Obtener perfil de un usuario"""
    return _load_profile(jid)

def get_context(jid: str) -> dict:
    """
    Retorna contexto resumido para que personality.py
    adapte la respuesta.
    """
    p = _load_profile(jid)
    return {
        'jid':            p.jid,
        'reputation':     p.reputation,
        'rep_score':      p.reputation_score,
        'response_style': p.response_style,
        'uses_slang':     p.uses_slang,
        'top_intents':    p.top_intents,
        'recent_intents': p.recent_intents,
        'msg_count':      p.msg_count,
        'is_toxic':       p.reputation == 'toxic',
        'is_trusted':     p.reputation == 'trusted',
        'active_hours':   p.active_hours,
    }

def get_summary(jid: str) -> str:
    """Resumen legible del perfil — para debug o comando #perfil"""
    p = _load_profile(jid)
    top = sorted(p.top_intents.items(), key=lambda x: -x[1])[:3]
    top_str = ', '.join(f'{k}({v})' for k, v in top) or 'ninguna'
    return (
        f'Mensajes: {p.msg_count} | '
        f'Reputación: {p.reputation} ({p.reputation_score:.0f}) | '
        f'Respuesta: {p.response_style} | '
        f'Intenciones: {top_str}'
    )

def get_all_profiles() -> list[UserProfile]:
    """Todos los perfiles guardados"""
    profiles = []
    for path in DATA_DIR.glob('*.json'):
        try:
            data = json.loads(path.read_text())
            profiles.append(UserProfile(**{
                k: v for k, v in data.items()
                if k in UserProfile.__dataclass_fields__
            }))
        except Exception:
            continue
    return profiles

def get_toxic_users() -> list[str]:
    """JIDs de usuarios tóxicos"""
    return [p.jid for p in get_all_profiles() if p.reputation == 'toxic']

def reset(jid: str) -> None:
    """Resetear perfil de un usuario"""
    with _lock:
        _cache.pop(jid, None)
        _dirty.discard(jid)
    path = _profile_path(jid)
    if path.exists():
        path.unlink()

def flush() -> None:
    """Forzar guardado de todos los perfiles"""
    _flush_dirty()

# ─── Background flush ─────────────────────────────────────────────────────────
def start_background_flush(interval: int = 60) -> None:
    """Guarda perfiles modificados cada N segundos"""
    import time
    def _loop():
        while True:
            time.sleep(interval)
            try:
                _flush_dirty()
            except Exception:
                pass
    threading.Thread(target=_loop, daemon=True, name='UserMemoryFlush').start()