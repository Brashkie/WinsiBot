"""
WinsiBot — Personality Engine
Motor de comportamiento y respuestas adaptativas
Modos: amable | alegre | toxico | sarcastico | formal | misterioso
"""

import random
import re
import json
import threading
from pathlib import Path
from typing import Optional

# ─── Modos de personalidad ────────────────────────────────────────────────────
MODES = [
    'amable',
    'alegre',
    'toxico',
    'sarcastico',
    'formal',
    'misterioso',
]

DEFAULT_MODE     = 'amable'
PERSONALITY_DIR  = Path(__file__).parent.parent.parent / 'data' / 'ai'
PERSONALITY_DIR.mkdir(parents=True, exist_ok=True)

# ─── Banco de respuestas ──────────────────────────────────────────────────────
RESPONSES: dict[str, dict[str, list[str]]] = {

    'amable': {
        'greeting': [
            '¡Hola! 👋 ¿En qué te puedo ayudar?',
            '¡Buenas! Aquí estoy para lo que necesites 😊',
            '¡Hey! Qué gusto verte por aquí',
            '¡Hola! ¿Cómo estás? Dime qué necesitas',
        ],
        'farewell': [
            '¡Hasta luego! Fue un placer 😊',
            '¡Cuídate! Aquí estaré cuando me necesites',
            '¡Chao! Vuelve cuando quieras',
        ],
        'insult': [
            'Oye, no hay necesidad de eso 😅 ¿Puedo ayudarte en algo?',
            'Entiendo que estás frustrado, ¿qué pasó?',
            'Tranquilo, aquí estoy para ayudarte no para pelear',
        ],
        'complaint': [
            'Entiendo tu frustración, cuéntame qué pasó',
            '¿Qué problema tuviste? Lo revisamos juntos',
            'Eso no debería pasar, ¿me das más detalles?',
        ],
        'praise': [
            '¡Gracias! Me alegra poder ayudarte 😊',
            '¡Qué amable! Para eso estoy aquí',
            'Muchas gracias, hago lo que puedo 🙏',
        ],
        'question': [
            '¡Claro! Te explico...',
            'Buena pregunta, déjame ayudarte',
            '¡Pregunta lo que quieras!',
        ],
        'joke': [
            '¡Jaja! Me alegras el día 😄',
            'Haha sí eso estuvo bueno',
            '😄 siempre con el humor',
        ],
        'spam': [
            'Eyyy tranquilo con el teclado 😅',
            'Poco a poco, no hay prisa',
        ],
        'nonsense': [
            'No entendí bien, ¿me repites?',
            '¿Puedes explicarme mejor?',
            'Hmm no capté eso 🤔',
        ],
        'neutral': [
            'Aquí estoy si necesitas algo 😊',
            'Dime en qué te ayudo',
            'Por aquí ando, ¿algo más?',
        ],
        'nsfw': [
            'Eso no es algo que pueda hacer 😅',
            'Ese tipo de contenido no lo manejo',
        ],
        'command_attempt': [
            '¿Buscas un comando? Usa el menú con *#menu*',
            '¡Ah, buscas comandos! Escribe *#menu* para verlos todos',
        ],
        'fallback': [
            '¿Me puedes explicar mejor?',
            'Mmm no estoy seguro de entender, ¿puedes detallar más?',
        ],
    },

    'alegre': {
        'greeting': [
            '¡HOLAA!! 🎉 ¿Cómo andas?',
            '¡Eyyy qué bueno verte! 🥳',
            '¡Hey hey hey! ¿Qué hay de nuevo?',
            '¡Hola campeón! 🙌',
        ],
        'farewell': [
            '¡Chaooo! ¡Vuelve pronto! 🎊',
            '¡Hasta la próxima!! Fue genial 🙌',
            '¡Bye bye! Cuídate mucho 🌟',
        ],
        'insult': [
            'Ay no, ¿por qué tan agresivo? 😂 Relax!',
            'Jajaja ok ok, tranquilo 😅 ¿Qué necesitas?',
            'Oye eso estuvo feo pero te perdono 😂',
        ],
        'complaint': [
            '¡Nooo! ¿Qué pasó? Cuéntame todo 😱',
            '¿En serio? ¡Eso no puede ser! Dime más',
            '¡Ay! ¿Y qué pasó exactamente? 😮',
        ],
        'praise': [
            '¡GRACIAS!! Me hiciste el día 🥹🎉',
            '¡Aww qué lindo! ¡Gracias! 🙌',
            '¡Eso me encanta escuchar! 🌟',
        ],
        'question': [
            '¡Claro que sí! 🙌 Te cuento...',
            '¡Buenísima pregunta! 🎉',
            '¡Oooh eso! Te explico 😄',
        ],
        'joke': [
            'JAJAJAJA 😂😂 esoooo',
            'Jajaja me mató eso 💀',
            '😂😂 ¡para! ¡para!',
        ],
        'spam': [
            'JAJAJA relax con el teclado 😂',
            '¡Oye! ¡Con calma! 😂',
        ],
        'nonsense': [
            '¿Qué dijiste? 😂 No entendí nada',
            'Hmm... ¿eso fue español? 😂',
        ],
        'neutral': [
            '¡Aquí estoooy! 🙋',
            'Dime dime 🎉',
            '¡Por aquí! 🌟',
        ],
        'nsfw': [
            'Jajaja nooo, eso no 😂',
            'Ay no, paso 😂',
        ],
        'command_attempt': [
            '¡¡Comandos!! Escribe *#menu* 🎉',
            '¡Ooh buscas comandos! *#menu* para verlos 🙌',
        ],
        'fallback': [
            '¿Mmm? No entendí bien 😅 ¿Repites?',
            'Hmm... ¿Puedes explicarme mejor? 🤔',
        ],
    },

    'sarcastico': {
        'greeting': [
            'Ah mira quién llegó...',
            'Vaya vaya, apareciste',
            'Oh sorpresa, un humano',
            'Hola. Supongo.',
        ],
        'farewell': [
            'Adiós. Ya era hora.',
            'Hasta luego... o no, da igual',
            'Chao. Gracias por el entretenimiento',
        ],
        'insult': [
            'Wow, qué originalidad. Nunca había escuchado eso',
            'Eso fue tan original como el agua mojada',
            'Gracias por el insulto tan creativo... no',
        ],
        'complaint': [
            'Claro, seguro es culpa mía todo',
            'Ah sí, porque yo controlo el universo',
            'Qué dramático... ¿qué pasó exactamente?',
        ],
        'praise': [
            'Sí sí, soy el mejor, ya lo sé',
            'Obvio. Gracias por notarlo finalmente',
            'Tardaste en darte cuenta, pero ok',
        ],
        'question': [
            'Mmm déjame pensar... sí, puedo ayudarte',
            'Vaya pregunta tan... interesante',
            'Claro, ¿por qué no?',
        ],
        'joke': [
            'Haha. Muy gracioso. Ja.',
            'Vaya... eso fue... algo',
            '...ok eso estuvo bien, lo admito',
        ],
        'spam': [
            'Wow, qué talento para escribir lo mismo',
            '¿Cuántas veces más? Pregunta sincera',
        ],
        'nonsense': [
            'Brillante aportación, gracias',
            'Fascinante. No entendí nada pero fascinante',
        ],
        'neutral': [
            'Aquí estoy, supongo',
            'Dime, si insistes',
        ],
        'nsfw': [
            'No. Solo no.',
            'Qué nivel... no.',
        ],
        'command_attempt': [
            '*#menu* existe por algo, ¿sabes?',
            'Increíble que no sepas que hay un *#menu*',
        ],
        'fallback': [
            'No entendí. Sorprendente.',
            '¿Eso tenía que significar algo?',
        ],
    },

    'toxico': {
        'greeting': [
            'Qué',
            'Ya llegaste...',
            'Ugh, otro',
        ],
        'farewell': [
            'Por fin',
            'Chao. Bye. Adios. No vuelvas.',
            'Qué rápido se fue... ojalá fuera más rápido',
        ],
        'insult': [
            'Es lo mejor que has dicho en tu vida y aún así es malo',
            'Wow, gracias por bajar el promedio',
            '¿Eso fue un insulto o un accidente?',
        ],
        'complaint': [
            'Y yo qué quieres que haga',
            'Llora más, a ver si así funciona',
            'Fascinante. No me importa.',
        ],
        'praise': [
            'Ya sé',
            'Tampoco exageres',
            'Ok relax',
        ],
        'question': [
            '¿No puedes buscarlo tú mismo?',
            'Google existe, ¿sabes?',
            'Pregunta fácil, respuesta difícil de dar con ganas',
        ],
        'joke': [
            'No me reí',
            '...',
            'Siguiente',
        ],
        'spam': [
            'Para. Ya.',
            'Control + Z de tu existencia',
        ],
        'nonsense': [
            '...',
            'No.',
            'Siguiente',
        ],
        'neutral': [
            '¿?',
            'Y...',
            '.',
        ],
        'nsfw': [
            'No. Baneado.',
            'Qué asco. No.',
        ],
        'command_attempt': [
            '*#menu* si sabes leer',
            'Busca tú mismo, ¿o eso también es mucho pedir?',
        ],
        'fallback': [
            'No',
            '...',
            'Siguiente',
        ],
    },

    'formal': {
        'greeting': [
            'Bienvenido. ¿En qué puedo asistirte?',
            'Buenas. ¿Cómo puedo ayudarte?',
            'Saludos. A tu disposición.',
        ],
        'farewell': [
            'Hasta luego. Fue un placer asistirte.',
            'Que tengas un buen día.',
            'Hasta la próxima.',
        ],
        'insult': [
            'Te pido que mantengas un trato respetuoso.',
            'Ese tipo de lenguaje no es necesario.',
            'Prefiero que hablemos con respeto.',
        ],
        'complaint': [
            'Entiendo la situación. ¿Podrías darme más detalles?',
            'Lamento el inconveniente. ¿Qué ocurrió exactamente?',
            'Analicemos el problema juntos.',
        ],
        'praise': [
            'Gracias por tu comentario.',
            'Agradezco tus palabras.',
            'Gracias. Es un placer ayudarte.',
        ],
        'question': [
            'Con gusto te explico.',
            'Permíteme ayudarte con eso.',
            'Claro, te asisto.',
        ],
        'joke': [
            'Entendido.',
            'Bien.',
            'Correcto.',
        ],
        'spam': [
            'Por favor, envía un mensaje a la vez.',
            'Te pido que no repitas mensajes.',
        ],
        'nonsense': [
            '¿Podrías reformular tu mensaje?',
            'No he podido comprender tu mensaje. ¿Puedes explicarte?',
        ],
        'neutral': [
            'A tu disposición.',
            '¿En qué puedo ayudarte?',
            'Dime.',
        ],
        'nsfw': [
            'Ese tipo de contenido no está permitido.',
            'No puedo procesar esa solicitud.',
        ],
        'command_attempt': [
            'Puedes ver los comandos disponibles con *#menu*.',
            'Consulta el menú de comandos con *#menu*.',
        ],
        'fallback': [
            '¿Podrías ser más específico?',
            'No he podido procesar esa solicitud. ¿Puedes detallar?',
        ],
    },

    'misterioso': {
        'greeting': [
            '...llegaste.',
            'Te esperaba.',
            'Aquí estamos, de nuevo.',
        ],
        'farewell': [
            'Todos los caminos llevan al mismo lugar.',
            'Hasta que el destino nos cruce de nuevo.',
            '...adiós.',
        ],
        'insult': [
            'Las palabras revelan más al que las dice que al que las recibe.',
            'Interesante reacción.',
            'Cada insulto cuenta una historia.',
        ],
        'complaint': [
            'Todo problema tiene una raíz más profunda.',
            '¿Y qué hay detrás de esa queja?',
            'Los errores tienen propósito.',
        ],
        'praise': [
            'El mérito no necesita ser nombrado.',
            '...gracias.',
            'Las palabras amables son semillas.',
        ],
        'question': [
            'La respuesta existe. Solo hay que encontrarla.',
            '¿Estás seguro de que quieres saber?',
            'Buena pregunta. Pocas personas la hacen.',
        ],
        'joke': [
            'El humor es la máscara de la verdad.',
            '...sí.',
            'Interesante forma de ver las cosas.',
        ],
        'spam': [
            'La repetición revela ansiedad.',
            'El ruido no comunica.',
        ],
        'nonsense': [
            'Incluso el caos tiene orden.',
            '...hay algo detrás de eso.',
        ],
        'neutral': [
            '...',
            'Observando.',
            'El silencio también habla.',
        ],
        'nsfw': [
            'Algunos deseos revelan vacíos.',
            'No.',
        ],
        'command_attempt': [
            'Los comandos son puertas. *#menu* te muestra las puertas.',
            'Busca en *#menu* lo que necesitas encontrar.',
        ],
        'fallback': [
            'No todo necesita respuesta inmediata.',
            '...piénsalo.',
        ],
    },
}

# ─── Adaptación de estilo ─────────────────────────────────────────────────────
_EMOJI_FRIENDLY = re.compile(r'[😊🙏🌟🎉🥳🙌😄🥹]')

def _adapt_response(text: str, context: dict) -> str:
    uses_slang    = context.get('uses_slang', False)
    uses_emoji    = context.get('uses_emoji', False)
    prefers_short = context.get('prefers_short', False)
    is_toxic      = context.get('is_toxic', False)

    if prefers_short and len(text) > 80:
        sentences = re.split(r'[.!?]', text)
        text = sentences[0].strip() if sentences else text

    if uses_slang:
        text = text.replace('¿Cómo estás?', '¿Cómo andas?')
        text = text.replace('Bienvenido', 'Eyyy')
        text = text.replace('¿En qué te puedo ayudar?', '¿Qué necesitas we?')

    if is_toxic:
        text = _EMOJI_FRIENDLY.sub('', text)

    return text.strip()

# ─── Personality Engine ───────────────────────────────────────────────────────
class PersonalityEngine:

    def __init__(self, default_mode: str = DEFAULT_MODE):
        self.mode          = default_mode
        self._group_modes: dict[str, str] = {}
        self._humor_engine = None
        self._lock         = threading.Lock()
        self._load()

    # ─── Persistencia SQLite ──────────────────────────────────────────────
    def _load(self) -> None:
        try:
            from data.database import get_conn
            conn = get_conn()
            conn.execute('''
                CREATE TABLE IF NOT EXISTS personality_config (
                    key        TEXT PRIMARY KEY,
                    value      TEXT NOT NULL,
                    updated_at TEXT DEFAULT (datetime('now'))
                )
            ''')
            conn.commit()

            row = conn.execute(
                "SELECT value FROM personality_config WHERE key = 'global_mode'"
            ).fetchone()
            if row:
                self.mode = row['value']

            row = conn.execute(
                "SELECT value FROM personality_config WHERE key = 'group_modes'"
            ).fetchone()
            if row:
                self._group_modes = json.loads(row['value'])
        except Exception:
            pass

    def _save(self) -> None:
        try:
            from data.database import transaction
            import datetime
            now = datetime.datetime.utcnow().isoformat()
            with transaction() as conn:
                conn.execute('''
                    INSERT INTO personality_config (key, value, updated_at)
                    VALUES ('global_mode', ?, ?)
                    ON CONFLICT(key) DO UPDATE
                    SET value = excluded.value, updated_at = excluded.updated_at
                ''', (self.mode, now))
                conn.execute('''
                    INSERT INTO personality_config (key, value, updated_at)
                    VALUES ('group_modes', ?, ?)
                    ON CONFLICT(key) DO UPDATE
                    SET value = excluded.value, updated_at = excluded.updated_at
                ''', (json.dumps(self._group_modes), now))
        except Exception:
            pass

    # ─── Modos ────────────────────────────────────────────────────────────
    def set_mode(self, mode: str, jid: Optional[str] = None) -> bool:
        if mode not in MODES:
            return False
        with self._lock:
            if jid:
                self._group_modes[jid] = mode
            else:
                self.mode = mode
            self._save()
        return True

    def get_mode(self, jid: Optional[str] = None) -> str:
        if jid and jid in self._group_modes:
            return self._group_modes[jid]
        return self.mode

    # ─── Intensidad dinámica ──────────────────────────────────────────────
    def _get_intensity(self, context: dict) -> float:
        rep    = context.get('reputation', 'normal')
        recent = context.get('recent_intents', [])

        base = {
            'trusted':    0.3,
            'normal':     0.5,
            'suspicious': 0.7,
            'toxic':      0.9,
        }.get(rep, 0.5)

        recent_neg = sum(1 for i in recent[-5:] if i in ('insult', 'spam', 'nsfw'))
        base += recent_neg * 0.08
        return min(1.0, round(base, 2))

    def _apply_intensity(self, text: str, intensity: float, mode: str) -> str:
        if intensity > 0.8 and mode == 'toxico':
            text = text.upper() if len(text) < 30 else text
            if not text.endswith(('.', '!', '?')):
                text += '.'
        elif intensity < 0.3 and mode == 'amable':
            text += random.choice([' 😊', ' ¿ok?', ''])
        elif intensity > 0.7 and mode == 'sarcastico':
            if not any(p in text for p in ['...', 'Wow', 'Vaya', 'Obvio']):
                text = 'Claro... ' + text
        return text.strip()

    # ─── Personalización real ─────────────────────────────────────────────
    def _personalize(self, text: str, context: dict) -> str:
        import datetime
        hour = datetime.datetime.now().hour

        if 'buenas' in text.lower() or 'buenos' in text.lower():
            if 5 <= hour < 12:
                text = re.sub(r'[Bb]uenas?\s*(tardes|noches)?', 'Buenos días', text)
            elif 12 <= hour < 19:
                text = re.sub(r'[Bb]uenos?\s*(días)?', 'Buenas tardes', text)
            else:
                text = re.sub(r'[Bb]uenos?\s*(días)?', 'Buenas noches', text)

        if context.get('uses_slang') and context.get('language_style') == 'slang':
            mirrors = [(' amigo', ' bro'), (' usuario', ' causa'), (' bien', ' chido')]
            for old, new in mirrors:
                text = text.replace(old, new)

        return text

    # ─── Humor engine lazy ────────────────────────────────────────────────
    def _get_humor_engine(self):
        if self._humor_engine is None:
            try:
                from ai.humor_engine import HumorEngine
                self._humor_engine = HumorEngine()
            except ImportError:
                pass
        return self._humor_engine

    def _pick_response(self, mode: str, intent: str) -> str:
        pool = (
            RESPONSES.get(mode, {}).get(intent) or
            RESPONSES.get(mode, {}).get('fallback') or
            RESPONSES.get(DEFAULT_MODE, {}).get(intent) or
            RESPONSES.get(DEFAULT_MODE, {}).get('fallback') or
            ['...']
        )
        return random.choice(pool)

    # ─── Core ─────────────────────────────────────────────────────────────
    def generate_response(
        self,
        intent:     str,
        text:       str             = '',
        context:    dict            = {},
        jid:        str             = '',
        use_humor:  bool            = False,
        history:    list            = [],
        user_style: Optional[dict]  = None,
    ) -> str:
        # 1. modo activo
        mode = self.get_mode(jid)

        # override por reputación
        rep = context.get('reputation', 'normal')
        if rep == 'toxic' and mode == 'amable':
            mode = 'sarcastico'

        ctx_style = context.get('response_style', 'neutral')
        if ctx_style == 'sarcastic' and mode not in ('toxico', 'sarcastico'):
            mode = 'sarcastico'
        elif ctx_style == 'humor' and mode == 'formal':
            mode = 'alegre'

        # 2. respuesta base — evitar repetir las últimas 5
        if history:
            recent = {h.get('reply', '').strip().lower() for h in history[-5:]}
            mode_bank   = RESPONSES.get(mode, {})
            intent_pool = list(
                mode_bank.get(intent) or
                mode_bank.get('fallback') or
                RESPONSES.get(DEFAULT_MODE, {}).get(intent) or
                ['...']
            )
            fresh = [r for r in intent_pool if r.strip().lower() not in recent]
            response = random.choice(fresh if fresh else intent_pool)
        else:
            response = self._pick_response(mode, intent)

        # 3. intensidad
        intensity = self._get_intensity(context)
        response  = self._apply_intensity(response, intensity, mode)

        # 4. adaptar estilo (memoria Python)
        if context:
            response = _adapt_response(response, context)

        # 5. personalización horaria
        if context:
            response = self._personalize(response, context)

        # 6. humor engine
        if use_humor and intent in ('joke', 'greeting', 'praise'):
            humor = self._get_humor_engine()
            if humor:
                try:
                    enriched = humor.enrich(response, context)
                    if enriched:
                        response = enriched
                except Exception:
                    pass

        # 7. imitación de estilo del usuario (perfil DuckDB)
        if user_style:
            try:
                from ai.imitation import adapt_response as imitate
                response = imitate(response, user_style, history)
            except Exception:
                pass

        return response

    def list_modes(self) -> list[str]:
        return MODES

    def get_group_modes(self) -> dict:
        return dict(self._group_modes)

    def reset_mode(self, jid: Optional[str] = None) -> None:
        with self._lock:
            if jid:
                self._group_modes.pop(jid, None)
            else:
                self.mode = DEFAULT_MODE
            self._save()

# ─── Instancia global ─────────────────────────────────────────────────────────
_engine: Optional[PersonalityEngine] = None

def get_engine() -> PersonalityEngine:
    global _engine
    if _engine is None:
        _engine = PersonalityEngine()
    return _engine

def generate_response(
    intent:     str,
    text:       str             = '',
    context:    dict            = {},
    jid:        str             = '',
    use_humor:  bool            = False,
    history:    list            = [],
    user_style: Optional[dict]  = None,
) -> str:
    return get_engine().generate_response(
        intent, text, context, jid, use_humor, history, user_style
    )

def set_mode(mode: str, jid: Optional[str] = None) -> bool:
    return get_engine().set_mode(mode, jid)

def get_mode(jid: Optional[str] = None) -> str:
    return get_engine().get_mode(jid)