"""
imitation.py — adapta la respuesta del bot al estilo del usuario.

Usa el perfil user_style calculado por trainer.py (Parquet + DuckDB) para:
- Ajustar longitud según avg_len del usuario
- Omitir emojis si el usuario nunca los usa
- Agregar emojis extra si el usuario los usa mucho
- Vocabulario más casual si detecta palabras de jerga
"""

import re
import time
from typing import Optional

_EMOJI_RE = re.compile(
    r'[\U0001F300-\U0001FAFF'
    r'☀-⟿'
    r'⌀-⏿'
    r'■-◿]'
)

# ─── Caché de perfiles con TTL ───────────────────────────────────────────────
_profile_cache: dict[str, tuple[dict, float]] = {}
CACHE_TTL = 600  # 10 minutos


def get_cached_style(sender_jid: str) -> Optional[dict]:
    """
    Obtiene user_style del cache; si expiró o no existe, consulta trainer.py.
    Retorna None si el usuario tiene < 15 mensajes o trainer no está disponible.
    """
    now = time.monotonic()
    cached = _profile_cache.get(sender_jid)
    if cached:
        style, ts = cached
        if now - ts < CACHE_TTL:
            return style if style else None
    # expiró o no existe — recargar
    try:
        from ai.trainer import get_profile
        p = get_profile(sender_jid)
        if p.msg_count >= 15:
            style = {
                'avg_len':      p.avg_len,
                'emoji_freq':   p.emoji_freq,
                'common_words': p.common_words,
            }
            _profile_cache[sender_jid] = (style, now)
            return style
        else:
            _profile_cache[sender_jid] = ({}, now)
    except Exception:
        pass
    return None


def invalidate_cache(sender_jid: str) -> None:
    """Elimina la entrada del cache (llamar tras borrar perfil del usuario)."""
    _profile_cache.pop(sender_jid, None)


_SLANG = frozenset({
    'jaja', 'jeje', 'jajaja', 'lol', 'xd', 'xdd', 'kkk', 'we', 'wey',
    'bro', 'causa', 'men', 'manito', 'wuach', 'uwu', 'owo', 'pls', 'wtf',
})

_CASUAL_MAP = [
    ('¿Cómo estás?',           '¿Cómo andas?'),
    ('¿En qué te puedo ayudar?', '¿Qué necesitas?'),
    ('Por supuesto',            'Claro'),
    ('Bienvenido',              'Eyyy'),
    ('Entendido',               'Ajá'),
    ('Con mucho gusto',         'Dale'),
]


def adapt_response(
    response:   str,
    user_style: dict,
    history:    Optional[list] = None,
) -> str:
    avg_len       = float(user_style.get('avg_len', 20.0))
    emoji_freq    = float(user_style.get('emoji_freq', 0.15))
    common_words  = set(user_style.get('common_words', []))

    # 1. Evitar repetir respuestas recientes del historial
    if history:
        recent = {h.get('reply', '').strip().lower() for h in history[-5:]}
        # Solo marcamos — el engine ya filtró esto, pero doble seguro
        if response.strip().lower() in recent and len(response) > 5:
            # Devolvemos sin modificar; el engine usará otra entrada del pool
            return response

    # 2. Adaptar longitud según cómo escribe el usuario
    if avg_len < 10 and len(response) > 70:
        parts = re.split(r'(?<=[.!?])\s+', response)
        response = parts[0].strip() if parts else response
    elif avg_len < 18 and len(response) > 130:
        parts = re.split(r'(?<=[.!?])\s+', response)
        response = ' '.join(parts[:2]).strip() if len(parts) >= 2 else response

    # 3. Adaptar emojis
    has_emojis = bool(_EMOJI_RE.search(response))
    if emoji_freq < 0.05 and has_emojis:
        response = _EMOJI_RE.sub('', response).strip()
    elif emoji_freq > 0.55 and not has_emojis:
        response = response.rstrip() + ' 😄'

    # 4. Vocabulario casual si el usuario usa jerga
    uses_slang = bool(common_words & _SLANG)
    if uses_slang:
        for formal, casual in _CASUAL_MAP:
            response = response.replace(formal, casual)

    return response.strip() or response


def adapt_response_auto(
    response:   str,
    sender_jid: str,
    history:    Optional[list] = None,
) -> str:
    """
    Igual que adapt_response() pero obtiene user_style automáticamente
    usando la caché TTL. Si no hay perfil suficiente, devuelve la respuesta sin cambios.
    """
    style = get_cached_style(sender_jid)
    if style:
        return adapt_response(response, style, history)
    return response
