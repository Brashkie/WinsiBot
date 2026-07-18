"""
WinsiBot — Humor Engine
Enriquece respuestas con humor adaptativo — NO reemplaza, SUMA
Adaptado por modo, usuario y contexto
"""

import random
import re
import time
from pathlib import Path
from collections import defaultdict

# ─── Config ───────────────────────────────────────────────────────────────────
# probabilidad base de agregar humor según modo
# (cubre los 12 modos de ai/personality.py::MODES — antes solo tenía los
# primeros 6, así que en los 6 modos nuevos el humor nunca se aplicaba)
MODE_HUMOR_PROB: dict[str, float] = {
    'amable':     0.25,   # 25% — ocasional
    'alegre':     0.55,   # 55% — frecuente
    'sarcastico': 0.45,   # 45% — ironía moderada
    'toxico':     0.35,   # 35% — humor negro esporádico
    'formal':     0.05,   # 5%  — casi nunca
    'misterioso': 0.15,   # 15% — filosófico ocasional
    'peruano':    0.40,   # 40% — jerga frecuente
    'gamer':      0.40,   # 40% — referencias frecuentes
    'amoroso':    0.30,   # 30% — cariñoso moderado
    'chistoso':   0.60,   # 60% — el más humorístico de todos
    'depresivo':  0.08,   # 8%  — casi nunca, y cuando pasa es humor negro seco
    'kawaii':     0.50,   # 50% — expresivo frecuente
}

# cooldown por usuario — evitar repetir humor seguido
HUMOR_COOLDOWN_S = 45   # segundos mínimos entre humor al mismo usuario

# ─── Banco de humor por modo ──────────────────────────────────────────────────
# cada entrada es un sufijo/prefijo/wrapper que se SUMA a la respuesta base

HUMOR_BANK: dict[str, dict[str, list[str]]] = {

    'amable': {
        'suffix': [
            ' 😄',
            ' (sin presión)',
            ' ¡con gusto!',
            '',
            ' ~ aquí para lo que sea',
        ],
        'prefix': [],
        'standalone': [],   # respuestas completamente humorísticas (raro)
    },

    'alegre': {
        'suffix': [
            ' 🎉',
            ' bestie!!',
            ' uwu',
            ' sksksksk',
            ' ngl',
            ' no cap',
            ' frfr',
            ' 💀',
            ' y eso',
            ' we',
        ],
        'prefix': [
            'Ojo → ',
            'Breaking news: ',
            'Fun fact: ',
            'Spoiler: ',
        ],
        'standalone': [
            'jajaja nah en serio → ',
            'ok boomer → ',
            'ratio → ',
        ],
        'meme_phrases': [
            '(no cap)',
            '(real)',
            '(based)',
            '(lowkey sí)',
            '(fr fr)',
            '(pov: tú leyendo esto)',
        ],
    },

    'sarcastico': {
        'suffix': [
            '... como siempre',
            '. Sorprendente.',
            '. Como era de esperar.',
            '. Qué novedad.',
            ' — genial, ¿verdad?',
            ' (no)',
        ],
        'prefix': [
            'Oh vaya, ',
            'Increíble pero cierto: ',
            'Adivina qué, ',
            'Sorpresa del día: ',
        ],
        'irony': [
            ' (muy original, por cierto)',
            ' (nunca lo hubiera imaginado)',
            ' (fascinante aportación)',
            ' (gracias por eso)',
            ' (cuánta profundidad)',
        ],
        'standalone': [
            'Wow. Solo wow.',
            '...interesante.',
            'Claro que sí.',
            'Obvio.',
        ],
    },

    'toxico': {
        'suffix': [
            '.',
            ' lol',
            ' smh',
            ' gg',
            ' bruh',
            ' L',
            ' ratio',
        ],
        'prefix': [
            'Mira qué sorpresa — ',
            'No pediste mi opinión pero — ',
        ],
        'roast': [
            ' (te lo digo con amor)',
            ' (es broma... o no)',
            ' (sin ofender, pero con ofender)',
            ' (facts)',
        ],
        'standalone': [
            'Bruh.',
            'L + ratio.',
            'No es mi problema.',
            'Siguiente.',
            '...',
        ],
    },

    'formal': {
        'suffix': [
            '.',
            ', con gusto.',
            ', como corresponde.',
        ],
        'prefix': [],
        'standalone': [],
    },

    'misterioso': {
        'suffix': [
            '...',
            '. O quizás no.',
            '. Piénsalo.',
            '. El tiempo dirá.',
            '. Como siempre.',
        ],
        'prefix': [
            'Curioso... ',
            'Interesante que preguntes eso — ',
            'Dicen que... ',
        ],
        'philosophical': [
            ' (¿o eso crees?)',
            ' (depende de cómo lo veas)',
            ' (todo tiene dos lados)',
            ' (la respuesta está en la pregunta)',
        ],
        'standalone': [
            '...hay más en eso de lo que parece.',
            'El universo escucha.',
            'Interesante.',
        ],
    },

    'peruano': {
        'suffix': [' causa', ' pe', ' bro', ' men'],
        'prefix': ['Oe, ', 'Ya pe, '],
        'standalone': ['Oe causa, ¿qué fue?', 'Habla pe.'],
    },

    'gamer': {
        'suffix': [' 🎮', ' GG', ' bro'],
        'prefix': ['Server dice: ', 'Patch notes: '],
        'standalone': ['AFK.', 'Ready cuando quieras.'],
    },

    'amoroso': {
        'suffix': [' 💕', ' 🥰', ' con cariño'],
        'prefix': ['Con todo el cariño: '],
        'standalone': ['Te quiero igual 💕', 'Aquí para ti 🌸'],
    },

    'chistoso': {
        'suffix': [' 😂', ' (es broma... o no)', ' jaja'],
        'prefix': ['Dato random: ', 'Fun fact: '],
        'standalone': ['Jajaja ok eso estuvo bueno.', 'No entendí pero me reí igual 😂'],
    },

    'depresivo': {
        'suffix': ['...', ''],
        'prefix': [],
        'standalone': ['...', 'Da igual.'],
    },

    'kawaii': {
        'suffix': [' owo', ' uwu', ' ✨'],
        'prefix': ['Kyaa~ '],
        'standalone': ['...nya~', '¿Nani? owo'],
    },
}

# ─── Slang por estilo de usuario ──────────────────────────────────────────────
SLANG_INJECT: dict[str, list[str]] = {
    'slang': [
        ' we', ' bro', ' causa', ' pe',
        ' ctm', ' oe', ' ntp', ' nmms',
    ],
    'casual': [
        ' ok', ' ya', ' claro',
    ],
    'formal': [],
    'neutral': [],
}

# ─── Intents donde el humor tiene más sentido ─────────────────────────────────
HUMOR_FRIENDLY_INTENTS = {
    'greeting', 'joke', 'praise', 'nonsense', 'spam', 'neutral',
}
HUMOR_AVOID_INTENTS = {
    'nsfw', 'insult',   # no agregar humor a situaciones tensas
}

# ─── Anti-repetición ──────────────────────────────────────────────────────────
_last_humor_ts:    dict[str, float]        = defaultdict(float)
_last_phrases:     dict[str, list[str]]    = defaultdict(list)
MAX_PHRASE_MEMORY  = 8   # recordar últimas N frases por usuario

def _was_used_recently(jid: str, phrase: str) -> bool:
    return phrase in _last_phrases.get(jid, [])

def _register_phrase(jid: str, phrase: str) -> None:
    mem = _last_phrases[jid]
    if phrase not in mem:
        mem.append(phrase)
    _last_phrases[jid] = mem[-MAX_PHRASE_MEMORY:]

# ─── Selector anti-repetición ─────────────────────────────────────────────────
def _pick_fresh(jid: str, pool: list[str]) -> str:
    """Elige frase que no se haya usado recientemente"""
    unused = [p for p in pool if not _was_used_recently(jid, p)]
    chosen = random.choice(unused if unused else pool)
    _register_phrase(jid, chosen)
    return chosen

# ─── Probabilidad adaptativa ──────────────────────────────────────────────────
def _should_apply_humor(
    jid:    str,
    mode:   str,
    intent: str,
    context: dict,
) -> bool:
    """
    Decide si aplicar humor considerando:
    - modo activo
    - intención del mensaje
    - cooldown por usuario
    - reputación (tóxicos reciben menos humor amigable)
    - aleatoriedad
    """
    # intents donde nunca meter humor
    if intent in HUMOR_AVOID_INTENTS:
        return False

    # cooldown — no spamear humor
    last = _last_humor_ts.get(jid, 0)
    if time.time() - last < HUMOR_COOLDOWN_S:
        return False

    # prob base del modo
    prob = MODE_HUMOR_PROB.get(mode, 0.2)

    # ajustar por intent — más prob en intents amigables
    if intent in HUMOR_FRIENDLY_INTENTS:
        prob *= 1.3

    # ajustar por estilo del usuario
    if context.get('uses_slang'):
        prob *= 1.2
    if context.get('reputation') == 'toxic':
        prob *= 0.5   # menos humor amigable con tóxicos
    if context.get('reputation') == 'trusted':
        prob *= 1.2   # más humor con usuarios de confianza

    prob = min(prob, 0.85)  # nunca más de 85%

    return random.random() < prob

# ─── Aplicadores de humor ─────────────────────────────────────────────────────
def _add_suffix(text: str, mode: str, jid: str) -> str:
    bank = HUMOR_BANK.get(mode, {})
    pool = bank.get('suffix', [])
    if not pool:
        return text
    suffix = _pick_fresh(jid, pool)
    if not suffix:
        return text
    # no duplicar puntuación
    if text.endswith(('.', '!', '?')) and suffix.startswith(('.', '!', '?')):
        suffix = suffix[1:]
    return text + suffix

def _add_prefix(text: str, mode: str, jid: str) -> str:
    bank = HUMOR_BANK.get(mode, {})
    pool = bank.get('prefix', [])
    if not pool:
        return text
    # no agregar prefix si el texto ya tiene uno de intensidad
    if text.startswith(('Claro', 'Oh', 'Vaya', 'Increíble', 'Adivina')):
        return text
    if random.random() < 0.35:
        prefix = _pick_fresh(jid, pool)
        text   = prefix + text[0].lower() + text[1:] if text else prefix
    return text

def _add_irony(text: str, mode: str, jid: str) -> str:
    bank    = HUMOR_BANK.get(mode, {})
    pool_key = {
        'sarcastico': 'irony',
        'toxico':     'roast',
        'misterioso': 'philosophical',
        'alegre':     'meme_phrases',
    }.get(mode)
    if not pool_key:
        return text
    pool = bank.get(pool_key, [])
    if not pool:
        return text
    phrase = _pick_fresh(jid, pool)
    # ← espacio si el texto no termina en espacio
    sep = '' if text.endswith(' ') else ' '
    return text + sep + phrase

def _inject_slang(text: str, context: dict, jid: str) -> str:
    style = context.get('language_style', 'neutral')
    pool  = SLANG_INJECT.get(style, [])
    if not pool:
        return text
    # solo agregar slang si no termina ya con uno
    last_word = text.split()[-1].lower() if text.split() else ''
    slang_words = {s.strip() for s in pool}
    if last_word in slang_words:
        return text
    if random.random() < 0.30:
        slang = _pick_fresh(jid, pool)
        text  = text.rstrip('.!?') + slang
    return text

# ─── Core ─────────────────────────────────────────────────────────────────────
class HumorEngine:

    def enrich(
        self,
        text:    str,
        context: dict = {},
        mode:    str  = 'amable',
        intent:  str  = 'neutral',
        jid:     str  = '',
    ) -> str:
        """
        Enriquece `text` con humor adaptativo.
        NUNCA reemplaza — siempre suma o devuelve el texto original.

        Pipeline:
        1. ¿Debe aplicarse humor? (prob + cooldown + intent)
        2. Elegir tipo de enriquecimiento (suffix | prefix | irony | slang)
        3. Aplicar sin romper el mensaje
        4. Registrar para anti-repetición
        """
        if not text or not text.strip():
            return text

        if not _should_apply_humor(jid, mode, intent, context):
            return text

        original = text

        # tipos disponibles según modo
        enrichers = ['suffix']
        bank = HUMOR_BANK.get(mode, {})

        if bank.get('prefix'):
            enrichers.append('prefix')
        if any(bank.get(k) for k in ('irony', 'roast', 'philosophical', 'meme_phrases')):
            enrichers.append('irony')
        if context.get('uses_slang') or context.get('language_style') == 'slang':
            enrichers.append('slang')

        # elegir tipo — pesos: suffix más común
        weights = {
            'suffix': 0.50,
            'prefix': 0.20,
            'irony':  0.20,
            'slang':  0.10,
        }
        available_weights = [weights.get(e, 0.1) for e in enrichers]
        chosen = random.choices(enrichers, weights=available_weights, k=1)[0]

        try:
            if chosen == 'suffix':
                text = _add_suffix(text, mode, jid)
            elif chosen == 'prefix':
                text = _add_prefix(text, mode, jid)
            elif chosen == 'irony':
                text = _add_irony(text, mode, jid)
            elif chosen == 'slang':
                text = _inject_slang(text, context, jid)
        except Exception:
            return original

        # registrar cooldown
        _last_humor_ts[jid] = time.time()

        return text.strip()

    def get_standalone(self, mode: str, jid: str = '') -> str:
        """
        Retorna una frase humorística standalone para casos especiales.
        Ej: cuando el bot quiere reaccionar a algo sin respuesta base.
        """
        bank = HUMOR_BANK.get(mode, {})
        pool = bank.get('standalone', [])
        if not pool:
            return '...'
        return _pick_fresh(jid, pool)

    def reset_cooldown(self, jid: str) -> None:
        _last_humor_ts.pop(jid, None)
        _last_phrases.pop(jid, None)