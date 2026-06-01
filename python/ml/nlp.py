import spacy
from pathlib import Path
from typing import Any

# ─── Cargar modelo ────────────────────────────────────────────────────────────
_nlp = None

def get_nlp():
    global _nlp
    if _nlp is None:
        try:
            _nlp = spacy.load("es_core_news_sm")
        except OSError:
            # modelo no descargado aún
            import subprocess, sys
            subprocess.run([sys.executable, "-m", "spacy", "download", "es_core_news_sm"])
            _nlp = spacy.load("es_core_news_sm")
    return _nlp

# ─── Análisis de texto ────────────────────────────────────────────────────────
def analyze_text(text: str) -> dict[str, Any]:
    """
    Análisis NLP completo de un mensaje:
    - Entidades nombradas (personas, lugares, organizaciones)
    - Tokens y lemas
    - Intención básica
    - Idioma detectado
    """
    nlp = get_nlp()
    doc = nlp(text[:512])  # limitar a 512 chars

    # entidades nombradas
    entities = [
        {
            "text":  ent.text,
            "label": ent.label_,
            "start": ent.start_char,
            "end":   ent.end_char,
        }
        for ent in doc.ents
    ]

    # tokens relevantes (sin stopwords ni puntuación)
    tokens = [
        {
            "text":   token.text,
            "lemma":  token.lemma_,
            "pos":    token.pos_,
            "is_stop": token.is_stop,
        }
        for token in doc
        if not token.is_punct and not token.is_space
    ]

    # verbos principales (intención)
    verbs = [t["lemma"] for t in tokens if t["pos"] == "VERB"]

    # sustantivos principales (tema)
    nouns = [t["lemma"] for t in tokens if t["pos"] == "NOUN"]

    return {
        "text":      text,
        "entities":  entities,
        "tokens":    tokens,
        "verbs":     verbs,
        "nouns":     nouns,
        "token_count": len(tokens),
        "entity_count": len(entities),
    }

# ─── Extractor de intención ───────────────────────────────────────────────────
def extract_intent(text: str) -> dict[str, Any]:
    """
    Detecta la intención del mensaje usando patrones lingüísticos.
    Útil para responder mensajes sin prefijo.
    """
    nlp  = get_nlp()
    doc  = nlp(text.lower()[:256])

    # patrones de intención
    INTENT_PATTERNS = {
        "saludo":    {"hola", "buenas", "hey", "saludos", "ola", "buen"},
        "despedida": {"adios", "bye", "chau", "hasta", "nos vemos"},
        "ayuda":     {"ayuda", "ayudar", "como", "que", "cual", "donde"},
        "gracias":   {"gracias", "thanks", "gracia", "ty"},
        "insulto":   {"idiota", "tonto", "estupido", "malo", "feo"},
        "pregunta":  {"que", "quien", "cuando", "donde", "como", "por que"},
    }

    lemmas = {token.lemma_ for token in doc if not token.is_stop}
    words  = {token.text for token in doc}
    all_w  = lemmas | words

    detected = []
    for intent, keywords in INTENT_PATTERNS.items():
        if all_w & keywords:
            detected.append(intent)

    return {
        "text":     text,
        "intents":  detected,
        "primary":  detected[0] if detected else "unknown",
        "is_question": text.strip().endswith("?") or "pregunta" in detected,
    }

# ─── Similaridad entre textos ─────────────────────────────────────────────────
def text_similarity(text1: str, text2: str) -> float:
    """
    Calcula similitud semántica entre dos textos.
    Útil para detectar comandos similares o mensajes repetidos.
    """
    nlp  = get_nlp()
    doc1 = nlp(text1[:256])
    doc2 = nlp(text2[:256])
    if not doc1.has_vector or not doc2.has_vector:
        return 0.0
    return round(float(doc1.similarity(doc2)), 4)

# ─── Extractor de entidades clave ─────────────────────────────────────────────
def extract_entities(text: str) -> dict[str, list[str]]:
    """
    Extrae entidades por tipo:
    PER = personas, LOC = lugares, ORG = organizaciones
    """
    nlp = get_nlp()
    doc = nlp(text[:512])

    result: dict[str, list[str]] = {
        "persons":       [],
        "locations":     [],
        "organizations": [],
        "misc":          [],
    }

    label_map = {
        "PER":  "persons",
        "LOC":  "locations",
        "ORG":  "organizations",
        "MISC": "misc",
    }

    for ent in doc.ents:
        key = label_map.get(ent.label_, "misc")
        if ent.text not in result[key]:
            result[key].append(ent.text)

    return result

# ─── Detector de idioma básico ────────────────────────────────────────────────
def detect_language(text: str) -> str:
    """
    Detección simple de idioma por vocabulario común.
    """
    ES_WORDS = {"hola", "que", "como", "esta", "para", "con", "por", "los", "las", "del"}
    EN_WORDS = {"the", "and", "for", "with", "you", "are", "have", "this", "that", "from"}
    PT_WORDS = {"que", "para", "com", "por", "uma", "nao", "mas", "como", "isso", "voce"}

    words = set(text.lower().split())
    es = len(words & ES_WORDS)
    en = len(words & EN_WORDS)
    pt = len(words & PT_WORDS)

    if max(es, en, pt) == 0:
        return "unknown"
    return max([("es", es), ("en", en), ("pt", pt)], key=lambda x: x[1])[0]