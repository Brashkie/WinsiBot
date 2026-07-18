"""
WinsiBot — Ollama Client
IA local sin API keys. Corre modelos como llama3.2, phi3, mistral en tu PC.

Requiere Ollama corriendo en localhost:11434
  → https://ollama.com
  → ollama pull llama3.2:3b
"""

from __future__ import annotations

import os
import logging
import httpx
from typing import Optional

log = logging.getLogger('ollama')

OLLAMA_URL   = os.getenv('OLLAMA_URL',   'http://localhost:11434')
OLLAMA_MODEL = os.getenv('OLLAMA_MODEL', 'llama3.2:3b')

# Timeout generoso — CPU inference es más lento que GPU. Medido en real: una
# respuesta corta (2 frases) con llama3.2:3b en CPU (sin GPU, size_vram=0) tardó
# ~19s — con prompts más largos (system prompt con vocabulario del grupo/
# usuario inyectado) puede pasar de eso fácil. 25s cortaba respuestas que
# igual iban a llegar, forzando el fallback a plantillas de Python
# innecesariamente — de ahí que Hepein pareciera "no hablar como una IA real".
TIMEOUT = float(os.getenv('OLLAMA_TIMEOUT', '40'))


async def is_available(model: Optional[str] = None) -> bool:
    """Verifica si Ollama está corriendo y tiene el modelo pedido (o el default)."""
    target = model or OLLAMA_MODEL
    try:
        async with httpx.AsyncClient(timeout=2) as http:
            r = await http.get(f'{OLLAMA_URL}/api/tags')
            if r.status_code != 200:
                return False
            models = [m['name'] for m in r.json().get('models', [])]
            # acepta coincidencia parcial: "llama3.2:3b" o "llama3.2"
            return any(target.split(':')[0] in m for m in models)
    except Exception:
        return False


async def chat(
    prompt:      str,
    system:      str,
    model:       Optional[str] = None,
    temperature: float = 0.85,
    max_tokens:  int   = 300,
) -> Optional[str]:
    """
    Envía un mensaje al modelo local vía Ollama.
    `model` permite pedir un modelo específico (p. ej. según la palabra
    disparadora en WhatsApp) — si no se pasa, usa OLLAMA_MODEL.
    Devuelve el texto generado o None si falla.
    """
    target = model or OLLAMA_MODEL
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as http:
            r = await http.post(
                f'{OLLAMA_URL}/v1/chat/completions',   # endpoint compatible con OpenAI
                json={
                    'model':       target,
                    'messages':    [
                        {'role': 'system', 'content': system},
                        {'role': 'user',   'content': prompt},
                    ],
                    'temperature': temperature,
                    'max_tokens':  max_tokens,
                    'stream':      False,
                },
            )
            if r.status_code == 200:
                text = r.json()['choices'][0]['message']['content'].strip()
                if text:
                    log.debug(f'Ollama ({target}): {len(text)} chars')
                    return text
            else:
                log.warning(f'Ollama HTTP {r.status_code}: {r.text[:200]}')
    except httpx.TimeoutException:
        log.warning(f'Ollama timeout ({TIMEOUT}s) — modelo muy lento para este hardware')
    except Exception as e:
        log.warning(f'Ollama error: {e}')
    return None


async def pull_model(model: str = OLLAMA_MODEL) -> bool:
    """Descarga el modelo si no está disponible (puede tardar varios minutos)."""
    try:
        async with httpx.AsyncClient(timeout=600) as http:
            async with http.stream('POST', f'{OLLAMA_URL}/api/pull', json={'name': model}) as r:
                async for line in r.aiter_lines():
                    if '"status"' in line:
                        log.info(f'Ollama pull: {line}')
        return True
    except Exception as e:
        log.error(f'Ollama pull error: {e}')
        return False
