"""
WinsiBot — Intent Classifier
Detecta intención de mensajes con sklearn (rápido) + transformers (profundo)
Aprende automáticamente de nuevos patrones
"""

import json
import re
import threading
import numpy as np
from pathlib import Path
from datetime import datetime
from dataclasses import dataclass, field
from typing import Optional
from rich.console import Console

console  = Console()
DATA_DIR = Path(__file__).parent.parent.parent / 'data' / 'ai'
DATA_DIR.mkdir(parents=True, exist_ok=True)

MODEL_PATH  = DATA_DIR / 'intent_model.pkl'
CORPUS_PATH = DATA_DIR / 'intent_corpus.json'

# ─── Intenciones ──────────────────────────────────────────────────────────────
INTENTS = [
    'greeting',        # hola, buenas, hey
    'farewell',        # chao, bye, adios
    'insult',          # insultos, groserías
    'spam',            # texto repetido, flood
    'question',        # preguntas
    'joke',            # humor, memes
    'complaint',       # queja, reclamo
    'praise',          # elogio al bot
    'command_attempt', # intentando usar un comando
    'nsfw',            # contenido inapropiado
    'nonsense',        # ← NUEVO
    'neutral',         # nada especial
]

# ─── Corpus inicial ───────────────────────────────────────────────────────────
INITIAL_CORPUS: list[tuple[str, str]] = [
    # greeting
    ('hola', 'greeting'),
    ('buenas', 'greeting'),
    ('hey', 'greeting'),
    ('qué tal', 'greeting'),
    ('cómo estás', 'greeting'),
    ('saludos', 'greeting'),
    ('buenos días', 'greeting'),
    ('buenas noches', 'greeting'),
    ('ola', 'greeting'),
    ('holaa', 'greeting'),

    # farewell
    ('chao', 'farewell'),
    ('bye', 'farewell'),
    ('adiós', 'farewell'),
    ('hasta luego', 'farewell'),
    ('nos vemos', 'farewell'),
    ('me voy', 'farewell'),
    ('ciao', 'farewell'),

    # insult
    ('eres una mierda', 'insult'),
    ('bot estúpido', 'insult'),
    ('inútil', 'insult'),
    ('asco de bot', 'insult'),
    ('me cae mal', 'insult'),
    ('bot de mierda', 'insult'),
    ('qué asco', 'insult'),
    ('idiota', 'insult'),

    # spam
    ('jajajajajajajajajaja', 'spam'),
    ('aaaaaaaaaaaaa', 'spam'),
    ('xdxdxdxdxdxd', 'spam'),
    ('hahahahahaha', 'spam'),
    ('llllllllllll', 'spam'),

    # question
    ('cómo funciona', 'question'),
    ('qué es', 'question'),
    ('para qué sirve', 'question'),
    ('me puedes ayudar', 'question'),
    ('cómo se usa', 'question'),
    ('qué comandos hay', 'question'),
    ('cuántos comandos tienes', 'question'),
    ('quién te hizo', 'question'),

    # joke
    ('jajaja', 'joke'),
    ('lol', 'joke'),
    ('xd', 'joke'),
    ('jeje', 'joke'),
    ('me muero de risa', 'joke'),
    ('eso estuvo bueno', 'joke'),
    ('cuéntame un chiste', 'joke'),

    # complaint
    ('no funciona', 'complaint'),
    ('está roto', 'complaint'),
    ('tardas mucho', 'complaint'),
    ('por qué no responde', 'complaint'),
    ('el bot falla', 'complaint'),
    ('no me sirve', 'complaint'),
    ('qué lento', 'complaint'),

    # praise
    ('eres el mejor', 'praise'),
    ('qué buen bot', 'praise'),
    ('me encanta', 'praise'),
    ('está genial', 'praise'),
    ('muy bueno', 'praise'),
    ('top', 'praise'),
    ('eres increíble', 'praise'),

    # command_attempt
    ('!ayuda', 'command_attempt'),
    ('/help', 'command_attempt'),
    ('#menu', 'command_attempt'),
    ('.sticker', 'command_attempt'),
    ('!sticker', 'command_attempt'),
    ('#s', 'command_attempt'),

    # nsfw
    ('mándame algo hot', 'nsfw'),
    ('contenido adulto', 'nsfw'),
    ('fotos de', 'nsfw'),
    ('videos nsfw', 'nsfw'),

    # neutral
    ('ok', 'neutral'),
    ('ya', 'neutral'),
    ('sí', 'neutral'),
    ('no', 'neutral'),
    ('tal vez', 'neutral'),
    ('quizás', 'neutral'),
    ('entendido', 'neutral'),
    ('gracias', 'neutral'),
    
    # nonsense
    ('asdfghjkl',          'nonsense'),
    ('qwertyuiop',         'nonsense'),
    ('zxcvbnm',            'nonsense'),
    ('123456789',          'nonsense'),
    ('aaaaabbbbb',         'nonsense'),
    ('djfkdsjfkds',        'nonsense'),
    ('ññññññ',             'nonsense'),
    ('????!!!',            'nonsense'),
    ('........',           'nonsense'),
    ('hdgsjhgdsjhg',       'nonsense'),
    ('pqowieuryt',         'nonsense'),
    ('xyzxyzxyz',          'nonsense'),
    ('fsjhfkjshfkj',       'nonsense'),
    ('!@#$%^',             'nonsense'),
    ('hfdshfkjdsh',        'nonsense'),

    # greeting — variantes latam
    ('que hay',            'greeting'),
    ('que onda',           'greeting'),
    ('que mas pues',       'greeting'),
    ('hola a todos',       'greeting'),
    ('como estan',         'greeting'),
    ('alguien activo',     'greeting'),
    ('buenas tardes',      'greeting'),
    ('buen dia',           'greeting'),
    ('wenas',              'greeting'),
    ('qtal',               'greeting'),

    # farewell — más variantes
    ('buenas noches',      'farewell'),
    ('que descanses',      'farewell'),
    ('hasta mañana',       'farewell'),
    ('me despido',         'farewell'),
    ('cuidense',           'farewell'),
    ('hasta pronto',       'farewell'),

    # question — más variantes
    ('alguien sabe',       'question'),
    ('me ayudan',          'question'),
    ('donde puedo',        'question'),
    ('como hago',          'question'),
    ('que paso',           'question'),
    ('cuando sale',        'question'),
    ('por que no',         'question'),
    ('me pueden decir',    'question'),
    ('saben algo de',      'question'),
    ('como se hace',       'question'),

    # joke — más variantes
    ('jajajajaja',         'joke'),
    ('me cague de risa',   'joke'),
    ('muerto de risa',     'joke'),
    ('sksksksk',           'joke'),
    ('ded',                'joke'),
    ('me estoy muriendo',  'joke'),
    ('jajaja que bueno',   'joke'),

    # praise — más variantes
    ('bacan',              'praise'),
    ('chevere',            'praise'),
    ('que buena',          'praise'),
    ('excelente',          'praise'),
    ('nice',               'praise'),
    ('bien bueno',         'praise'),
    ('de pana bueno',      'praise'),
    ('crack',              'praise'),
    ('eres lo mejor',      'praise'),

    # complaint — más variantes
    ('esto no sirve',      'complaint'),
    ('que mal',            'complaint'),
    ('cuando arreglan',    'complaint'),
    ('no me ayuda',        'complaint'),
    ('cuanto demora',      'complaint'),
    ('no responde',        'complaint'),
    ('tarda mucho',        'complaint'),

    # insult — más variantes
    ('bot de porqueria',   'insult'),
    ('que asco de bot',    'insult'),
    ('eres un inutil',     'insult'),
    ('no sirves para nada','insult'),

    # spam — más variantes
    ('111111111111',       'spam'),
    ('sisisisisisi',       'spam'),
    ('nooooooooooo',       'spam'),
    ('jajjajajajajajaj',   'spam'),
    ('eeeeeeeeeeeee',      'spam'),

    # neutral — más variantes
    ('dale',               'neutral'),
    ('ya vi',              'neutral'),
    ('listo',              'neutral'),
    ('ah ok',              'neutral'),
    ('claro',              'neutral'),
    ('perfecto',           'neutral'),
    ('de acuerdo',         'neutral'),
    ('ok gracias',         'neutral'),
    ('ahi vemos',          'neutral'),
    ('bien',               'neutral'),

    # command_attempt — más prefijos
    ('.menu',              'command_attempt'),
    ('/sticker',           'command_attempt'),
    ('!help',              'command_attempt'),
    ('#bot',               'command_attempt'),
    ('!perfil',            'command_attempt'),
    ('/comandos',          'command_attempt'),
    ('!rank',              'command_attempt'),

    # nsfw — más variantes
    ('fotos calientes',    'nsfw'),
    ('manda algo picante', 'nsfw'),
    ('contenido para mayores', 'nsfw'),
    ('video xxx',          'nsfw'),
]

# ─── Resultado ────────────────────────────────────────────────────────────────
@dataclass
class IntentResult:
    intent:       str
    confidence:   float
    all_scores:   dict = field(default_factory=dict)
    method:       str  = 'sklearn'   # sklearn | transformer | rule
    is_nsfw:      bool = False
    is_spam:      bool = False
    is_insult:    bool = False
    extras:       dict = field(default_factory=dict)

# ─── Reglas rápidas (sin ML) ──────────────────────────────────────────────────
_SPAM_RE    = re.compile(r'(.)\1{7,}')         # caracter repetido 7+ veces
_INSULT_RE  = re.compile(
    r'\b(mierda|idiota|estup[ií]do|imb[eé]cil|in[uú]til|asco|pendejo|'
    r'hdp|ctm|puta|basura|porquer[ií]a|malparido|gonorrea|hijueputa)\b',
    re.IGNORECASE
)
_NSFW_RE    = re.compile(
    r'\b(hot|nsfw|adulto|porn|xxx|desnud|nud|hentai|caliente|picante|erotic)\b',
    re.IGNORECASE
)
_GREET_RE   = re.compile(
    r'^(hola+|ola+|hey+|buenas?|buenos?\s*(d[íi]as?|tardes?|noches?)|'
    r'saludos?|hi|hello|wenas?|que\s*(onda|hay|tal)|buen\s*d[íi]a)\b',
    re.IGNORECASE
)
_CMD_RE     = re.compile(r'^[!#./][\w]+')
_FAREWELL_RE = re.compile(
    r'^(cha+o|bye|adi[oó]s|hasta\s*(luego|ma[ñn]ana|pronto)|'
    r'nos\s*vemos|me\s*voy|ciao|cuidense?)\b',
    re.IGNORECASE
)

_NONSENSE_RE = re.compile(
    r'^[^aeiouáéíóúAEIOUÁÉÍÓÚ\s]{6,}$|'   # solo consonantes
    r'^[\W\d]{5,}$|'                          # solo símbolos/números
    r'(.{1,3})\1{4,}'                         # patrón repetido corto
)

def _rule_based(text: str) -> Optional[IntentResult]:
    stripped = text.strip()

    if _SPAM_RE.search(stripped):
        return IntentResult('spam', 0.99, method='rule', is_spam=True)

    if _NONSENSE_RE.match(stripped) and len(stripped) < 20:
        return IntentResult('nonsense', 0.95, method='rule')

    if _CMD_RE.match(stripped):
        return IntentResult('command_attempt', 0.97, method='rule')

    if _INSULT_RE.search(stripped):
        return IntentResult('insult', 0.92, method='rule', is_insult=True)

    if _NSFW_RE.search(stripped):
        return IntentResult('nsfw', 0.92, method='rule', is_nsfw=True)

    if _GREET_RE.match(stripped) and len(stripped) < 40:
        return IntentResult('greeting', 0.94, method='rule')

    if _FAREWELL_RE.match(stripped) and len(stripped) < 40:
        return IntentResult('farewell', 0.93, method='rule')

    return None

# ─── Clasificador sklearn ──────────────────────────────────────────────────────
class SklearnClassifier:
    def __init__(self):
        self.model  = None
        self._lock  = threading.Lock()
        self._extra: list[tuple[str, str]] = []
        self._load_or_train(INITIAL_CORPUS)

    def _load_or_train(self, data: list[tuple[str, str]]) -> None:
        try:
            if MODEL_PATH.exists():
                import joblib
                self.model = joblib.load(MODEL_PATH)
                return
        except Exception:
            pass
        self._train(data)

    def _train(self, data: list[tuple[str, str]]) -> None:
        try:
            from sklearn.pipeline import Pipeline
            from sklearn.feature_extraction.text import TfidfVectorizer
            from sklearn.linear_model import LogisticRegression

            # cargar corpus guardado si existe
            extra = []
            if CORPUS_PATH.exists():
                try:
                    extra = json.loads(CORPUS_PATH.read_text())
                except Exception:
                    pass

            all_data = data + [(d['text'], d['intent']) for d in extra]
            texts    = [d[0] for d in all_data]
            labels   = [d[1] for d in all_data]

            self.model = Pipeline([
                ('tfidf', TfidfVectorizer(
                    ngram_range  = (1, 3),
                    max_features = 8000,
                    analyzer     = 'char_wb',
                    sublinear_tf = True,
                )),
                ('clf', LogisticRegression(
                    max_iter     = 1000,
                    C            = 5.0,
                    random_state = 42,
                    solver       = 'lbfgs',
                    # ← multi_class removido en sklearn >= 1.5
                )),
            ])
            self.model.fit(texts, labels)

            import joblib
            joblib.dump(self.model, MODEL_PATH)

            console.print(f'  [green]✔ IntentClassifier entrenado — {len(texts)} ejemplos[/green]')
        except Exception as e:
            import traceback
            console.print(f'  [yellow]§ IntentClassifier train error: {e}[/yellow]')
            console.print(f'  [dim]{traceback.format_exc()}[/dim]')

    def predict(self, text: str) -> IntentResult:
        with self._lock:
            if self.model is None:
                return IntentResult('neutral', 0.0)
            try:
                pred   = self.model.predict([text])[0]
                proba  = self.model.predict_proba([text])[0]
                classes = self.model.classes_
                scores = {c: round(float(p), 3) for c, p in zip(classes, proba)}
                conf   = float(max(proba))
                return IntentResult(
                    intent     = pred,
                    confidence = round(conf, 3),
                    all_scores = scores,
                    method     = 'sklearn',
                    is_nsfw    = pred == 'nsfw',
                    is_spam    = pred == 'spam',
                    is_insult  = pred == 'insult',
                )
            except Exception:
                return IntentResult('neutral', 0.0)

    def learn(self, text: str, intent: str) -> None:
        """
        Guardar nuevo ejemplo con deduplicación + re-entrenamiento inteligente.
        - Deduplication: no guarda el mismo texto dos veces
        - Balanceo: si una clase tiene muchos más ejemplos, pondera
        - Re-entrena cada 30 nuevos ejemplos O si una clase nueva aparece
        """
        entry = {'text': text, 'intent': intent, 'ts': datetime.utcnow().isoformat()}
        try:
            existing = []
            if CORPUS_PATH.exists():
                existing = json.loads(CORPUS_PATH.read_text())

            # deduplicar — no guardar texto idéntico
            texts_existing = {d['text'] for d in existing}
            if text in texts_existing:
                return

            existing.append(entry)
            CORPUS_PATH.write_text(json.dumps(existing[-3000:], indent=2))
        except Exception:
            pass

        self._extra.append((text, intent))

        # detectar clase nueva — re-entrenar inmediatamente
        known_intents = {d[1] for d in INITIAL_CORPUS}
        is_new_intent = intent not in known_intents

        # re-entrenar si: 30 nuevos ejemplos OR clase nueva OR múltiplo de 50
        total_extra = len(self._extra)
        should_retrain = (
            total_extra >= 30 or
            is_new_intent or
            (total_extra > 0 and total_extra % 50 == 0)
        )

        if should_retrain:
            all_data = INITIAL_CORPUS + self._extra
            threading.Thread(
                target = self._train,
                args   = (all_data,),
                daemon = True,
                name   = 'IntentRetrain',
            ).start()
            if total_extra >= 30:
                self._extra = []

# ─── Transformers (profundo — bajo demanda) ───────────────────────────────────
class TransformerClassifier:
    """
    Usa un modelo de HuggingFace para clasificación profunda.
    Solo se carga cuando sklearn tiene baja confianza (<0.6).
    """
    _instance = None
    _lock     = threading.Lock()
    _loaded   = False

    @classmethod
    def get(cls) -> Optional['TransformerClassifier']:
        with cls._lock:
            if cls._instance is None:
                cls._instance = cls()
            return cls._instance

    def __init__(self):
        self.pipe = None

    def _load(self) -> bool:
        with self.__class__._lock:          # protege _loaded y la carga del modelo
            if self.__class__._loaded:
                return self.pipe is not None
            try:
                from transformers import pipeline
                self.pipe = pipeline(
                    'text-classification',
                    model      = 'cardiffnlp/twitter-xlm-roberta-base-sentiment',
                    top_k      = None,
                    truncation = True,
                    max_length = 128,
                )
                self.__class__._loaded = True
                return True
            except Exception as e:
                console.print(f'  [dim]§ Transformer no disponible: {e}[/dim]')
                self.__class__._loaded = True
                return False

    def predict_sentiment(self, text: str) -> dict:
        """
        Retorna sentimiento del texto.
        Complementa la clasificación de intención con contexto emocional.
        """
        if not self._load() or self.pipe is None:
            return {}
        try:
            results = self.pipe(text[:256])[0]
            return {r['label'].lower(): round(r['score'], 3) for r in results}
        except Exception:
            return {}

# ─── Intent Classifier principal ──────────────────────────────────────────────
class IntentClassifier:
    def __init__(self):
        self.sklearn     = SklearnClassifier()
        self._use_trans  = False   # activar transformers lazy

    def classify(self, text: str, use_transformer: bool = False) -> IntentResult:
        """
        Pipeline:
        1. Reglas rápidas (sin ML) — casos obvios
        2. sklearn — clasificación rápida
        3. Transformer — solo si confianza < 0.6 y use_transformer=True
        """
        if not text or not text.strip():
            return IntentResult('neutral', 1.0, method='rule')

        # 1. reglas
        rule_result = _rule_based(text)
        if rule_result and rule_result.confidence >= 0.90:
            return rule_result

        # 2. sklearn
        result = self.sklearn.predict(text)

        # 3. transformer si confianza baja
        if use_transformer and result.confidence < 0.6:
            try:
                trans  = TransformerClassifier.get()
                senti  = trans.predict_sentiment(text)
                if senti:
                    result.extras['sentiment'] = senti
                    # ajustar intención si sentimiento es muy negativo
                    neg = senti.get('negative', 0)
                    if neg > 0.8 and result.intent == 'neutral':
                        result.intent     = 'complaint'
                        result.method     = 'transformer'
                        result.confidence = round(neg, 3)
            except Exception:
                pass

        return result

    def learn(self, text: str, intent: str) -> None:
        """Aprender de corrección manual"""
        if intent not in INTENTS:
            return
        self.sklearn.learn(text, intent)

    def batch_classify(self, texts: list[str]) -> list[IntentResult]:
        """Clasificar múltiples textos"""
        return [self.classify(t) for t in texts]

    def get_stats(self) -> dict:
        """Stats del clasificador"""
        corpus_size = 0
        try:
            if CORPUS_PATH.exists():
                corpus_size = len(json.loads(CORPUS_PATH.read_text()))
        except Exception:
            pass
        return {
            'model_loaded':  self.sklearn.model is not None,
            'corpus_size':   corpus_size + len(INITIAL_CORPUS),
            'intents':       INTENTS,
            'transformer':   TransformerClassifier._loaded,
        }

# ─── Instancia global ─────────────────────────────────────────────────────────
_classifier: Optional[IntentClassifier] = None

def get_classifier() -> IntentClassifier:
    global _classifier
    if _classifier is None:
        _classifier = IntentClassifier()
    return _classifier

def classify(text: str, use_transformer: bool = False) -> IntentResult:
    return get_classifier().classify(text, use_transformer)

def learn(text: str, intent: str) -> None:
    get_classifier().learn(text, intent)