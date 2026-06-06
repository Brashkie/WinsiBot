"""
imitation.py — adapta la respuesta del bot al estilo del usuario.

Usa el perfil user_style calculado por Rust (DuckDB) para:
- Ajustar longitud según avg_len del usuario
- Omitir emojis si el usuario nunca los usa
- Agregar emojis extra si el usuario los usa mucho
- Vocabulario más casual si detecta palabras de jerga
"""

import re
from typing import Optional

_EMOJI_RE = re.compile(
    r'[\U0001F300-\U0001FAFF'
    r'☀-⟿'
    r'⌀-⏿'
    r'■-◿]'
)

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
