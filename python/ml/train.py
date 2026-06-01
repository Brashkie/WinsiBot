import sys
import polars as pl
from pathlib import Path
from datetime import datetime

sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from python.data.parquet_store import load_messages, load_df
from python.ml.models import (
    CommandIntentModel, SpamDetectorModel,
    get_intent_model, get_spam_model,
)

# ─── Datos de entrenamiento base ──────────────────────────────────────────────
INTENT_EXAMPLES = [
    # (texto, label)
    ('!ping',           'ping'),
    ('!menu',           'menu'),
    ('!help',           'menu'),
    ('!ayuda',          'menu'),
    ('!sticker',        'sticker'),
    ('!s',              'sticker'),
    ('!tiktok',         'tiktok'),
    ('!tt',             'tiktok'),
    ('!ytmp3',          'ytmp3'),
    ('!yt',             'ytmp3'),
    ('!spotify',        'spotify'),
    ('!sp',             'spotify'),
    ('!gpt',            'gpt'),
    ('!ai',             'gpt'),
    ('!imagine',        'imagine'),
    ('!img',            'imagine'),
    ('!traducir',       'traducir'),
    ('!tl',             'traducir'),
    ('!clima',          'clima'),
    ('!weather',        'clima'),
    ('!ban',            'ban'),
    ('!kick',           'kick'),
    ('!warn',           'warn'),
    ('!stats',          'stats'),
    ('hola como estas', 'none'),
    ('que hora es',     'none'),
    ('gracias',         'none'),
    ('ok',              'none'),
    ('jajaja',          'none'),
]

SPAM_EXAMPLES = [
    # (texto, is_spam: 0=no, 1=si)
    ('GANA DINERO GRATIS!!!', 1),
    ('http://bit.ly/free-money', 1),
    ('AAAAAAAAAAAAAAAAAAAAA', 1),
    ('Únete a nuestro grupo t.me/spam', 1),
    ('VENDO SEGUIDORES BARATOS', 1),
    ('hola como estas', 0),
    ('!ping', 0),
    ('buenos días', 0),
    ('gracias por la ayuda', 0),
    ('qué haces hoy?', 0),
]

# ─── Entrenar desde historial de mensajes ─────────────────────────────────────
def enrich_from_history() -> tuple[list, list, list, list]:
    """
    Enriquece los datos de entrenamiento con el historial de mensajes
    guardado en Parquet.
    """
    intent_texts, intent_labels = [], []
    spam_texts, spam_labels     = [], []

    try:
        df = load_messages(limit=5000)
        if df.is_empty():
            return intent_texts, intent_labels, spam_texts, spam_labels

        for row in df.to_dicts():
            text    = row.get('text', '')
            command = row.get('command', '')

            if not text:
                continue

            # datos para intent
            if command:
                intent_texts.append(text)
                intent_labels.append(command)
            else:
                intent_texts.append(text)
                intent_labels.append('none')

            # datos para spam (heurística simple)
            is_spam = int(
                len(text) > 200 or
                text.count('!') > 5 or
                'http' in text.lower() or
                't.me/' in text.lower()
            )
            spam_texts.append(text)
            spam_labels.append(is_spam)

    except Exception as e:
        print(f"  ⚠ Error cargando historial: {e}")

    return intent_texts, intent_labels, spam_texts, spam_labels

# ─── Funciones de entrenamiento ───────────────────────────────────────────────
def train_intent_model(verbose: bool = True) -> dict:
    texts  = [t for t, _ in INTENT_EXAMPLES]
    labels = [l for _, l in INTENT_EXAMPLES]

    # enriquecer con historial
    h_texts, h_labels, _, _ = enrich_from_history()
    texts  += h_texts
    labels += h_labels

    if verbose:
        print(f"  → Entrenando intent model con {len(texts)} ejemplos...")

    model  = CommandIntentModel()
    result = model.train(texts, labels)
    model.save()

    if verbose:
        print(f"  ✔ Intent model — accuracy: {result['accuracy']} | clases: {result['classes']}")

    return result

def train_spam_model(verbose: bool = True) -> dict:
    texts  = [t for t, _ in SPAM_EXAMPLES]
    labels = [l for _, l in SPAM_EXAMPLES]

    _, _, h_texts, h_labels = enrich_from_history()
    texts  += h_texts
    labels += h_labels

    if verbose:
        print(f"  → Entrenando spam model con {len(texts)} ejemplos...")

    model  = SpamDetectorModel()
    result = model.train(texts, labels)
    model.save()

    if verbose:
        print(f"  ✔ Spam model — accuracy: {result['accuracy']}")

    return result

def train_all(verbose: bool = True) -> dict:
    print("\n  𒁈 Iniciando entrenamiento de modelos WinsiBot...\n")
    start = datetime.utcnow()

    results = {
        'intent': train_intent_model(verbose),
        'spam':   train_spam_model(verbose),
        'elapsed': None,
        'trained_at': start.isoformat(),
    }

    elapsed = (datetime.utcnow() - start).total_seconds()
    results['elapsed'] = round(elapsed, 2)

    print(f"\n  ✔ Entrenamiento completado en {elapsed:.2f}s\n")
    return results

# ─── CLI ──────────────────────────────────────────────────────────────────────
if __name__ == '__main__':
    results = train_all(verbose=True)
    print(f"  Intent accuracy: {results['intent']['accuracy']}")
    print(f"  Spam accuracy:   {results['spam']['accuracy']}")