"""
WinsiBot — AI Brain
Núcleo de decisiones inteligentes con anomaly detection + aprendizaje continuo
sklearn para decisiones rápidas + transformers para NLP profundo
"""

import json
import time
import threading
import numpy as np
from pathlib import Path
from datetime import datetime
from dataclasses import dataclass, asdict, field
from typing import Optional
from rich.console import Console

console  = Console()
ROOT_DIR = Path(__file__).parent.parent.parent
DATA_DIR = ROOT_DIR / 'data' / 'ai'
DATA_DIR.mkdir(parents=True, exist_ok=True)

BRAIN_LOG   = DATA_DIR / 'brain_log.json'
ANOMALY_LOG = DATA_DIR / 'anomaly_log.json'

# ─── Tipos ────────────────────────────────────────────────────────────────────
@dataclass
class BrainEvent:
    timestamp:  str
    type:       str        # anomaly | decision | learning | alert
    source:     str        # health | break | message | command
    score:      float      # 0-1 confianza
    data:       dict = field(default_factory=dict)
    action:     str  = ''  # qué decidió hacer

@dataclass
class AnomalyResult:
    is_anomaly:  bool
    score:       float      # -1 a 1 (IsolationForest)
    features:    list
    description: str

# ─── Feature engineering ──────────────────────────────────────────────────────
def _extract_system_features() -> np.ndarray:
    """
    Extrae features del sistema para anomaly detection.
    Combina: RAM, CPU, latencia Flask, errores recientes, reinicios.
    """
    import psutil
    features = []

    # RAM
    mem = psutil.virtual_memory()
    features.append(mem.percent / 100.0)

    # CPU
    features.append(psutil.cpu_percent(interval=0.3) / 100.0)

    # disk
    try:
        disk = psutil.disk_usage(str(ROOT_DIR))
        features.append(disk.percent / 100.0)
    except Exception:
        features.append(0.5)

    # errores recientes del health log
    try:
        if BRAIN_LOG.exists():
            logs = json.loads(BRAIN_LOG.read_text())[-50:]
            error_rate = sum(1 for l in logs if l.get('type') == 'anomaly') / max(len(logs), 1)
            features.append(error_rate)
        else:
            features.append(0.0)
    except Exception:
        features.append(0.0)

    # hora del día normalizada (0-1) — patrones de uso
    hour = datetime.now().hour
    features.append(hour / 24.0)

    # proceso Node activo
    node_active = 0.0
    for proc in psutil.process_iter(['cmdline']):
        try:
            cmd = ' '.join(proc.info.get('cmdline') or [])
            if 'tsx' in cmd and 'index.ts' in cmd:
                node_active = 1.0
                break
        except Exception:
            pass
    features.append(node_active)

    return np.array(features, dtype=np.float32)

# ─── Anomaly Detector ─────────────────────────────────────────────────────────
class AnomalyDetector:
    """
    IsolationForest que aprende el comportamiento normal del sistema.
    Se re-entrena cada N samples nuevos.
    """
    MODEL_PATH   = DATA_DIR / 'anomaly_model.pkl'
    SAMPLES_PATH = DATA_DIR / 'anomaly_samples.npy'
    MIN_SAMPLES  = 50    # mínimo para entrenar
    RETRAIN_EACH = 100   # re-entrenar cada N nuevos samples

    def __init__(self):
        self.model       = None
        self.samples     = []
        self.sample_count = 0
        self._lock       = threading.RLock()   # RLock — predict llama add_sample bajo el mismo lock
        self._load()

    def _load(self) -> None:
        try:
            if self.MODEL_PATH.exists():
                import joblib
                self.model = joblib.load(self.MODEL_PATH)
            if self.SAMPLES_PATH.exists():
                arr = np.load(str(self.SAMPLES_PATH))
                self.samples = arr.tolist()
                self.sample_count = len(self.samples)
        except Exception:
            pass

    def _save(self) -> None:
        try:
            import joblib
            joblib.dump(self.model, self.MODEL_PATH)
            np.save(str(self.SAMPLES_PATH), np.array(self.samples[-2000:]))
        except Exception:
            pass

    def _train(self) -> None:
        if len(self.samples) < self.MIN_SAMPLES:
            return
        try:
            from sklearn.ensemble import IsolationForest
            X = np.array(self.samples[-2000:])
            self.model = IsolationForest(
                n_estimators   = 100,
                contamination  = 0.05,  # 5% esperado de anomalías
                random_state   = 42,
                n_jobs         = -1,
            )
            self.model.fit(X)
            self._save()
        except Exception as e:
            console.print(f'  [yellow]§ AnomalyDetector train error: {e}[/yellow]')

    def add_sample(self, features: np.ndarray) -> None:
        with self._lock:
            self.samples.append(features.tolist())
            self.sample_count += 1
            # re-entrenar periódicamente
            if self.sample_count % self.RETRAIN_EACH == 0:
                threading.Thread(target=self._train, daemon=True).start()

    def predict(self, features: np.ndarray) -> AnomalyResult:
        with self._lock:
            self.add_sample(features)

            if self.model is None or len(self.samples) < self.MIN_SAMPLES:
                return AnomalyResult(
                    is_anomaly  = False,
                    score       = 0.0,
                    features    = features.tolist(),
                    description = f'Acumulando datos ({len(self.samples)}/{self.MIN_SAMPLES})',
                )

            try:
                X      = features.reshape(1, -1)
                pred   = self.model.predict(X)[0]          # 1=normal, -1=anomaly
                score  = self.model.score_samples(X)[0]    # más negativo = más anómalo
                is_ano = pred == -1

                desc = ''
                if is_ano:
                    # identificar qué feature es anómala
                    labels = ['RAM', 'CPU', 'Disco', 'Error rate', 'Hora', 'Node activo']
                    mean   = np.mean(np.array(self.samples[-100:]), axis=0)
                    diffs  = np.abs(features - mean)
                    worst  = int(np.argmax(diffs))
                    desc   = f'Anomalía en {labels[worst] if worst < len(labels) else "sistema"}'

                return AnomalyResult(
                    is_anomaly  = is_ano,
                    score       = float(score),
                    features    = features.tolist(),
                    description = desc or 'Sistema normal',
                )
            except Exception as e:
                return AnomalyResult(False, 0.0, features.tolist(), f'Error: {e}')

# ─── Decision Engine ──────────────────────────────────────────────────────────
class DecisionEngine:
    """
    Toma decisiones basadas en el estado del sistema.
    Aprende qué acciones son más efectivas con el tiempo.
    """
    DECISIONS_PATH = DATA_DIR / 'decisions.json'

    def __init__(self):
        self.history: list[dict] = []
        self._load()

    def _load(self) -> None:
        try:
            if self.DECISIONS_PATH.exists():
                self.history = json.loads(self.DECISIONS_PATH.read_text())[-500:]
        except Exception:
            self.history = []

    def _save(self) -> None:
        try:
            self.DECISIONS_PATH.write_text(
                json.dumps(self.history[-500:], indent=2)
            )
        except Exception:
            pass

    def decide(self, anomaly: AnomalyResult, health_status: str) -> str:
        """
        Decide qué acción tomar basándose en anomalía + estado de salud.
        Aprende de decisiones pasadas.
        """
        if not anomaly.is_anomaly and health_status == 'ok':
            return 'none'

        features = anomaly.features
        ram_pct  = features[0] if len(features) > 0 else 0
        cpu_pct  = features[1] if len(features) > 1 else 0

        # reglas base + aprendizaje
        action = 'alert'

        if ram_pct > 0.92:
            action = 'alert_critical_ram'
        elif cpu_pct > 0.90:
            action = 'alert_critical_cpu'
        elif anomaly.is_anomaly and anomaly.score < -0.5:
            action = 'alert_anomaly'
        elif health_status == 'critical':
            action = 'alert_critical_system'

        # registrar decisión para aprendizaje
        entry = {
            'timestamp':    datetime.utcnow().isoformat(),
            'action':       action,
            'anomaly_score':anomaly.score,
            'health_status':health_status,
            'features':     anomaly.features,
        }
        self.history.append(entry)
        self._save()

        return action

# ─── Log classifier ───────────────────────────────────────────────────────────
class LogClassifier:
    """
    Clasifica logs con sklearn (rápido) + transformers (profundo).
    Aprende nuevos patrones de error automáticamente.
    """
    MODEL_PATH = DATA_DIR / 'log_classifier.pkl'
    VOCAB_PATH = DATA_DIR / 'log_vocab.json'

    # categorías de logs
    CATEGORIES = [
        'error_baileys',
        'error_flask',
        'error_node',
        'warning',
        'info',
        'spam',
        'security',
    ]

    # ejemplos de entrenamiento inicial
    TRAINING_DATA = [
        ('Connection Closed',          'error_baileys'),
        ('Stream Errored',             'error_baileys'),
        ('Bad MAC',                    'error_baileys'),
        ('proto mismatch',             'error_baileys'),
        ('Flask no responde',          'error_flask'),
        ('ECONNREFUSED 5000',          'error_flask'),
        ('ModuleNotFoundError',        'error_flask'),
        ('heap out of memory',         'error_node'),
        ('Cannot read properties',     'error_node'),
        ('TypeError',                  'error_node'),
        ('ETIMEDOUT',                  'warning'),
        ('rate limit',                 'warning'),
        ('RAM alta',                   'warning'),
        ('Comando ejecutado',          'info'),
        ('WinsiBot conectado',         'info'),
        ('grupos precargados',         'info'),
        ('spam detectado',             'spam'),
        ('flood',                      'spam'),
        ('demasiado rápido',           'spam'),
        ('eval(',                      'security'),
        ('shell=True',                 'security'),
        ('pickle.loads',               'security'),
    ]

    def __init__(self):
        self.model      = None
        self.vectorizer = None
        self._lock      = threading.Lock()
        self._extra_data: list[tuple[str, str]] = []
        self._load_or_train()

    def _load_or_train(self) -> None:
        try:
            if self.MODEL_PATH.exists():
                import joblib
                saved           = joblib.load(self.MODEL_PATH)
                self.model      = saved['model']
                self.vectorizer = saved['vectorizer']
                return
        except Exception:
            pass
        self._train(self.TRAINING_DATA)

    def _train(self, data: list[tuple[str, str]]) -> None:
        try:
            from sklearn.pipeline import Pipeline
            from sklearn.feature_extraction.text import TfidfVectorizer
            from sklearn.linear_model import LogisticRegression

            texts  = [d[0] for d in data]
            labels = [d[1] for d in data]

            self.model = Pipeline([
                ('tfidf', TfidfVectorizer(
                    ngram_range = (1, 2),
                    max_features = 5000,
                    analyzer    = 'word',
                )),
                ('clf', LogisticRegression(
                    max_iter    = 500,
                    random_state = 42,
                )),
            ])
            self.model.fit(texts, labels)

            import joblib
            joblib.dump({'model': self.model, 'vectorizer': None}, self.MODEL_PATH)
        except Exception as e:
            console.print(f'  [yellow]§ LogClassifier train error: {e}[/yellow]')

    def classify(self, text: str) -> dict:
        """Clasifica un log y retorna categoría + confianza"""
        with self._lock:
            if self.model is None:
                return {'category': 'info', 'confidence': 0.0}
            try:
                pred       = self.model.predict([text])[0]
                proba      = self.model.predict_proba([text])[0]
                confidence = float(max(proba))
                return {'category': pred, 'confidence': round(confidence, 3)}
            except Exception:
                return {'category': 'info', 'confidence': 0.0}

    def learn(self, text: str, true_category: str) -> None:
        """Agregar nuevo ejemplo y re-entrenar"""
        self._extra_data.append((text, true_category))
        if len(self._extra_data) >= 20:
            all_data = self.TRAINING_DATA + self._extra_data
            threading.Thread(
                target  = self._train,
                args    = (all_data,),
                daemon  = True,
            ).start()
            self._extra_data = []

# ─── AI Brain principal ───────────────────────────────────────────────────────
class AIBrain:
    """
    Cerebro central — coordina anomaly detection, clasificación y decisiones.
    Corre en background aprendiendo continuamente.
    """
    def __init__(self):
        self.anomaly   = AnomalyDetector()
        self.decisions = DecisionEngine()
        self.classifier = LogClassifier()
        self._events: list[BrainEvent] = []
        self._lock   = threading.Lock()
        self._running = False

    def analyze_system(self) -> BrainEvent:
        """Analiza el estado del sistema y decide acción"""
        features = _extract_system_features()
        anomaly  = self.anomaly.predict(features)

        # obtener health status
        health_status = 'ok'
        try:
            health_log = ROOT_DIR / 'data' / 'health_log.json'
            if health_log.exists():
                logs = json.loads(health_log.read_text())
                if logs:
                    health_status = logs[-1].get('status', 'ok')
        except Exception:
            pass

        action = self.decisions.decide(anomaly, health_status)

        event = BrainEvent(
            timestamp = datetime.utcnow().isoformat(),
            type      = 'anomaly' if anomaly.is_anomaly else 'normal',
            source    = 'system',
            score     = abs(anomaly.score),
            data      = {
                'features':     anomaly.features,
                'description':  anomaly.description,
                'health_status': health_status,
            },
            action = action,
        )

        with self._lock:
            self._events.append(event)
            self._events = self._events[-200:]

        self._save_event(event)
        return event

    def classify_log(self, text: str) -> dict:
        """Clasifica una línea de log"""
        return self.classifier.classify(text)

    def learn_from_log(self, text: str, category: str) -> None:
        """Aprende de una corrección manual"""
        self.classifier.learn(text, category)

    def _save_event(self, event: BrainEvent) -> None:
        try:
            existing = []
            if BRAIN_LOG.exists():
                existing = json.loads(BRAIN_LOG.read_text())
            existing.append(asdict(event))
            BRAIN_LOG.write_text(json.dumps(existing[-500:], indent=2))
        except Exception:
            pass

    def get_summary(self) -> dict:
        """Resumen del estado actual"""
        with self._lock:
            recent   = self._events[-20:]
            anomalies = [e for e in recent if e.type == 'anomaly']
            return {
                'total_events':   len(self._events),
                'recent_anomalies': len(anomalies),
                'last_action':    recent[-1].action if recent else 'none',
                'model_samples':  self.anomaly.sample_count,
                'learning':       self.anomaly.sample_count >= AnomalyDetector.MIN_SAMPLES,
            }

    def start_background(self, interval: int = 60) -> None:
        """Análisis continuo en background"""
        if self._running:
            return
        self._running = True

        def _loop():
            while self._running:
                try:
                    event = self.analyze_system()
                    if event.type == 'anomaly':
                        console.print(
                            f'  [yellow]§ AI Brain — anomalía: {event.data.get("description")}[/yellow]'
                        )
                        # disparar alerta
                        try:
                            from ai.alert_system import send_alert
                            send_alert(
                                title   = 'ai:anomaly',
                                message = event.data.get('description', 'Anomalía detectada'),
                                level   = 'high',
                                source  = 'brain',
                            )
                        except Exception:
                            pass
                except Exception as e:
                    console.print(f'  [red]✗ AI Brain error: {e}[/red]')
                time.sleep(interval)

        threading.Thread(target=_loop, daemon=True, name='AIBrain').start()
        console.print(f'  [cyan]◆ AI Brain iniciado — análisis cada {interval}s[/cyan]')

    def stop(self) -> None:
        self._running = False

# ─── Instancia global ─────────────────────────────────────────────────────────
brain = AIBrain()

def get_brain() -> AIBrain:
    return brain

def run_once() -> BrainEvent:
    return brain.analyze_system()