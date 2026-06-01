import numpy as np
import polars as pl
from pathlib import Path
from datetime import datetime
from typing import Any
import joblib
import os

MODEL_DIR = Path("data/models")

# ─── Base ──────────────────────────────────────────────────────────────────────
def _model_path(name: str) -> Path:
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    return MODEL_DIR / f"{name}.pkl"

def save_model(model: Any, name: str) -> str:
    path = _model_path(name)
    joblib.dump(model, path)
    return str(path)

def load_model(name: str) -> Any | None:
    path = _model_path(name)
    if not path.exists():
        return None
    return joblib.load(path)

def model_exists(name: str) -> bool:
    return _model_path(name).exists()

# ─── Modelo de intención de comandos ──────────────────────────────────────────
class CommandIntentModel:
    """
    Clasifica si un texto tiene intención de ser un comando
    y predice cuál comando es más probable.
    Usa TF-IDF + Naive Bayes — liviano y rápido.
    """

    def __init__(self):
        self.vectorizer = None
        self.classifier = None
        self.classes_   = []
        self.trained    = False

    def _build(self):
        from sklearn.feature_extraction.text import TfidfVectorizer
        from sklearn.naive_bayes import MultinomialNB
        self.vectorizer = TfidfVectorizer(
            max_features=500,
            ngram_range=(1, 2),
            analyzer='char_wb',
        )
        self.classifier = MultinomialNB(alpha=0.1)

    def train(self, texts: list[str], labels: list[str]) -> dict:
        from sklearn.model_selection import cross_val_score
        self._build()
        X = self.vectorizer.fit_transform(texts)
        self.classifier.fit(X, labels)
        self.classes_  = list(self.classifier.classes_)
        self.trained   = True

        scores = cross_val_score(self.classifier, X, labels, cv=min(3, len(set(labels))))
        return {
            'accuracy':  round(float(scores.mean()), 4),
            'std':       round(float(scores.std()), 4),
            'samples':   len(texts),
            'classes':   len(self.classes_),
            'trained_at': datetime.utcnow().isoformat(),
        }

    def predict(self, text: str) -> dict:
        if not self.trained or not self.vectorizer:
            return {'label': 'unknown', 'confidence': 0.0, 'proba': {}}
        X     = self.vectorizer.transform([text])
        label = self.classifier.predict(X)[0]
        proba = self.classifier.predict_proba(X)[0]
        proba_dict = {
            cls: round(float(p), 4)
            for cls, p in zip(self.classes_, proba)
        }
        return {
            'label':      label,
            'confidence': round(float(max(proba)), 4),
            'proba':      dict(sorted(proba_dict.items(), key=lambda x: -x[1])[:5]),
        }

    def save(self, name: str = 'command_intent'):
        save_model({'vectorizer': self.vectorizer, 'classifier': self.classifier,
                    'classes': self.classes_, 'trained': self.trained}, name)

    def load(self, name: str = 'command_intent') -> bool:
        data = load_model(name)
        if not data:
            return False
        self.vectorizer = data['vectorizer']
        self.classifier = data['classifier']
        self.classes_   = data['classes']
        self.trained    = data['trained']
        return True

# ─── Modelo de spam ───────────────────────────────────────────────────────────
class SpamDetectorModel:
    """
    Detecta mensajes spam o flood en el bot.
    Usa características simples + Logistic Regression.
    """

    def __init__(self):
        self.vectorizer = None
        self.classifier = None
        self.trained    = False

    def _extract_features(self, text: str) -> dict:
        return {
            'len':          len(text),
            'caps_ratio':   sum(1 for c in text if c.isupper()) / max(len(text), 1),
            'digit_ratio':  sum(1 for c in text if c.isdigit()) / max(len(text), 1),
            'repeat_chars': max((text.count(c) for c in set(text)), default=0),
            'links':        int('http' in text or 'www.' in text or 't.me' in text),
            'exclamations': text.count('!'),
            'words':        len(text.split()),
        }

    def train(self, texts: list[str], labels: list[int]) -> dict:
        from sklearn.linear_model import LogisticRegression
        from sklearn.preprocessing import StandardScaler
        from sklearn.pipeline import Pipeline

        features = [list(self._extract_features(t).values()) for t in texts]
        X        = np.array(features)

        self.classifier = Pipeline([
            ('scaler', StandardScaler()),
            ('clf',    LogisticRegression(max_iter=200)),
        ])
        self.classifier.fit(X, labels)
        self.trained = True

        from sklearn.model_selection import cross_val_score
        scores = cross_val_score(self.classifier, X, labels, cv=min(3, len(set(labels))))
        return {
            'accuracy':  round(float(scores.mean()), 4),
            'samples':   len(texts),
            'trained_at': datetime.utcnow().isoformat(),
        }

    def predict(self, text: str) -> dict:
        if not self.trained:
            return {'is_spam': False, 'confidence': 0.0}
        features = list(self._extract_features(text).values())
        X        = np.array([features])
        label    = int(self.classifier.predict(X)[0])
        proba    = self.classifier.predict_proba(X)[0]
        return {
            'is_spam':    bool(label),
            'confidence': round(float(max(proba)), 4),
        }

    def save(self, name: str = 'spam_detector'):
        save_model({'classifier': self.classifier, 'trained': self.trained}, name)

    def load(self, name: str = 'spam_detector') -> bool:
        data = load_model(name)
        if not data:
            return False
        self.classifier = data['classifier']
        self.trained    = data['trained']
        return True

# ─── Modelo de sentimiento ────────────────────────────────────────────────────
class SentimentModel:
    """
    Analiza sentimiento básico de mensajes.
    Positivo / Negativo / Neutro.
    """

    # léxico básico en español
    POSITIVE = {'bueno', 'excelente', 'genial', 'gracias', 'bien', 'perfecto',
                'increíble', 'amor', 'feliz', 'contento', 'lindo', 'bonito',
                'épico', 'crack', 'brutal', 'chévere', 'cool', 'top'}
    NEGATIVE = {'malo', 'horrible', 'pésimo', 'odio', 'feo', 'terrible',
                'molesto', 'fastidio', 'asco', 'basura', 'inútil', 'estúpido',
                'tonto', 'idiota', 'maldito', 'fatal', 'peor'}

    def predict(self, text: str) -> dict:
        words    = set(text.lower().split())
        pos      = len(words & self.POSITIVE)
        neg      = len(words & self.NEGATIVE)
        total    = pos + neg

        if total == 0:
            return {'sentiment': 'neutral', 'confidence': 1.0, 'pos': 0, 'neg': 0}

        if pos > neg:
            return {'sentiment': 'positive', 'confidence': round(pos / total, 4), 'pos': pos, 'neg': neg}
        if neg > pos:
            return {'sentiment': 'negative', 'confidence': round(neg / total, 4), 'pos': pos, 'neg': neg}
        return {'sentiment': 'neutral', 'confidence': 0.5, 'pos': pos, 'neg': neg}

# ─── Singleton instances ──────────────────────────────────────────────────────
_intent_model:    CommandIntentModel | None = None
_spam_model:      SpamDetectorModel  | None = None
_sentiment_model: SentimentModel     | None = None

def get_intent_model() -> CommandIntentModel:
    global _intent_model
    if _intent_model is None:
        _intent_model = CommandIntentModel()
        _intent_model.load()
    return _intent_model

def get_spam_model() -> SpamDetectorModel:
    global _spam_model
    if _spam_model is None:
        _spam_model = SpamDetectorModel()
        _spam_model.load()
    return _spam_model

def get_sentiment_model() -> SentimentModel:
    global _sentiment_model
    if _sentiment_model is None:
        _sentiment_model = SentimentModel()
    return _sentiment_model