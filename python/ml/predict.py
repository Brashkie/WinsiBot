import polars as pl
import numpy as np
from typing import Any

def run_prediction(payload: dict) -> dict[str, Any]:
    """
    Punto de entrada para predicciones ML.
    Aquí conectas tus modelos sklearn / TensorFlow.
    """
    text = payload.get('text', '')
    # placeholder — reemplaza con tu modelo real
    result = {
        'input': text,
        'label': 'neutral',
        'confidence': 0.85,
        'tokens': len(text.split()),
    }
    return result