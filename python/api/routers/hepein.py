"""
WinsiBot — Hepein Router
IA que aprende del grupo y puede imitar el estilo de sus miembros.

Endpoints:
  POST /api/v1/hepein/record         — registrar mensaje (fire-and-forget)
  POST /api/v1/hepein/respond        — respuesta contextual con perfil aprendido
  POST /api/v1/hepein/imitate        — imitar el estilo de un usuario concreto
  GET  /api/v1/hepein/profile/{jid}  — perfil de estilo del usuario
  GET  /api/v1/hepein/group/{group}  — estilo del grupo
  DELETE /api/v1/hepein/profile/{jid} — borrar datos de un usuario (RGPD)
  GET  /api/v1/hepein/stats          — estadísticas del pipeline
"""

from __future__ import annotations

import asyncio
import logging
import os
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

log    = logging.getLogger('hepein')
router = APIRouter()

# ─── Modelos de request ───────────────────────────────────────────────────────

class RecordRequest(BaseModel):
    group_jid:  str
    sender_jid: str
    text:       str
    is_reply:   bool = False

class RespondRequest(BaseModel):
    prompt:     str
    group_jid:  str
    sender_jid: str
    intent:     str            = 'neutral'
    mode:       Optional[str]  = None   # override de personalidad
    model:      Optional[str]  = None   # modelo Ollama específico (según palabra disparadora) — sin cascada a GPT/Claude/Gemini
    use_gpt:    bool           = True   # usar GPT/Claude/Gemini
    use_humor:  bool           = False
    history:    list           = []     # turnos recientes del sender (getAIContext) — evita repetir plantilla

class ImitateRequest(BaseModel):
    prompt:      str
    target_jid:  str           # a quién imitar
    group_jid:   str
    sender_jid:  str

# ─── Helpers internos ─────────────────────────────────────────────────────────

def _build_system_prompt(
    group_style,
    user_profile,
    personality_mode: str,
    bot_name: str = 'Hepein',
    prompt: str = '',
) -> str:
    """
    Construye el system prompt enriquecido con el estilo aprendido del grupo.
    Este prompt hace que el modelo hable como un miembro real del grupo.
    Si el usuario pregunta sobre comandos, inyecta el catálogo relevante.
    """
    # OJO: esta lista tiene que cubrir TODOS los modos de ai/personality.py::MODES
    # (12 en total) — antes solo tenía los primeros 6, así que al hablar con la
    # IA real (Ollama/GPT/etc.) los 6 modos nuevos (peruano, gamer, amoroso,
    # chistoso, depresivo, kawaii) caían silenciosamente al default 'natural':
    # el modo SÍ quedaba guardado y SÍ se usaba bien en el fallback de
    # plantillas (RESPONSES sí tiene los 12), pero la respuesta de la IA real
    # no reflejaba el cambio de personalidad para esos 6 modos.
    mode_desc = {
        'amable':     'amigable y servicial',
        'alegre':     'energético y divertido',
        'toxico':     'sarcástico y sin filtro',
        'sarcastico': 'irónico con humor negro suave',
        'formal':     'profesional y educado',
        'misterioso': 'filosófico y críptico',
        'peruano':    'peruano, usa jerga como "causa", "pe", "bro", "oe"',
        'gamer':      'gamer, usa términos como GG, lag, noob y referencias a videojuegos',
        'amoroso':    'cariñoso y afectuoso, con mucho cariño y emojis de corazón',
        'chistoso':   'bromista, siempre buscando el chiste y la observación cómica',
        'depresivo':  'apático, nihilista, con humor negro y desgano',
        'kawaii':     'estilo anime kawaii, tierno, usa uwu/owo y onomatopeyas',
    }.get(personality_mode, 'natural')

    parts = [
        f"Eres {bot_name}, la IA del bot WinsiBot en este grupo de WhatsApp.",
        f"Tu personalidad es: {mode_desc}.",
        "Responde siempre en español. Sé breve: máximo 2 frases salvo que pidan algo largo.",
        "",
    ]

    # Estilo del grupo
    if group_style and group_style.msg_count >= 10:
        if group_style.common_words:
            parts.append(f"Vocabulario típico del grupo: {', '.join(group_style.common_words[:20])}")
        if group_style.avg_msg_len < 30:
            parts.append("El grupo usa mensajes muy cortos e informales.")
        elif group_style.avg_msg_len > 80:
            parts.append("El grupo escribe mensajes más elaborados.")
        if group_style.emoji_freq > 0.5:
            parts.append("El grupo usa emojis con frecuencia.")
        if group_style.vocab_sample:
            sample = group_style.vocab_sample[:4]
            parts.append(f"Ejemplos de mensajes del grupo (SOLO para que copies el TONO, jamás el contenido):")
            for s in sample:
                parts.append(f'  • "{s}"')
            parts.append("IMPORTANTE: nunca repitas ni parafrasees estos ejemplos como si fueran tu respuesta — son solo referencia de cómo habla el grupo, no texto para reciclar.")
        parts.append("")

    # Estilo del interlocutor
    if user_profile and user_profile.msg_count >= 15:
        parts.append("El usuario que te escribe tiene este estilo de escritura:")
        if user_profile.avg_len < 15:
            parts.append("  - Escribe muy corto.")
        elif user_profile.avg_len > 60:
            parts.append("  - Escribe mensajes largos.")
        if user_profile.uses_slang:
            parts.append("  - Usa mucha jerga y lenguaje informal.")
        if user_profile.emoji_freq > 0.5:
            parts.append("  - Usa muchos emojis.")
        elif user_profile.emoji_freq < 0.05:
            parts.append("  - Casi no usa emojis.")
        if user_profile.vocab_sample:
            parts.append(f'  - Ejemplo de su forma de escribir (no repitas esta frase, es solo referencia de estilo): "{user_profile.vocab_sample[0]}"')
        parts.append("")

    # Conocimiento de comandos — se inyecta si el usuario pregunta sobre el bot
    try:
        from ai.commands_ref import is_command_query, build_commands_section
        if prompt and is_command_query(prompt):
            cmd_section = build_commands_section(prompt)
            if cmd_section:
                parts.append(cmd_section)
                parts.append("")
    except Exception:
        pass

    parts.append("Responde de forma natural, como lo haría un miembro de este grupo específico.")
    parts.append("Generá una respuesta ORIGINAL y propia al mensaje del usuario — nunca copies, parafrasees ni reutilices los ejemplos de arriba, son solo guía de tono.")
    return '\n'.join(parts)


def _build_imitate_prompt(target_profile, target_jid: str) -> str:
    """
    System prompt para imitar el estilo de un usuario concreto.
    """
    name = target_jid.split('@')[0]
    parts = [
        f"Responde exactamente como habla el usuario @{name}.",
        "Adapta: longitud del mensaje, uso de emojis, vocabulario y tono.",
    ]
    if target_profile and target_profile.msg_count >= 15:
        if target_profile.avg_len < 12:
            parts.append("Este usuario escribe muy corto, a veces solo 1-3 palabras.")
        elif target_profile.avg_len > 70:
            parts.append("Este usuario escribe largo y detallado.")
        if target_profile.uses_slang:
            parts.append("Usa mucha jerga: " + ', '.join(list(SLANG_WORDS & set(target_profile.common_words))[:5]))
        if target_profile.common_words:
            parts.append(f"Sus palabras frecuentes: {', '.join(target_profile.common_words[:12])}")
        if target_profile.vocab_sample:
            parts.append("Ejemplos de cómo habla:")
            for s in target_profile.vocab_sample[:5]:
                parts.append(f'  • "{s}"')
        if target_profile.emoji_freq < 0.05:
            parts.append("Este usuario casi no usa emojis. No uses emojis en tu respuesta.")
        elif target_profile.emoji_freq > 0.6:
            parts.append("Este usuario usa muchos emojis. Incluye emojis en tu respuesta.")
    else:
        parts.append("No hay suficientes datos del usuario, imita un estilo casual en español.")
    parts.append("Responde en máximo 2 frases.")
    return '\n'.join(parts)

SLANG_WORDS = frozenset({
    'jaja','jeje','jajaja','lol','xd','we','wey','bro','causa','men','uwu','owo',
})

async def _call_ai(prompt: str, system: str, use_gpt: bool = True, model: Optional[str] = None) -> Optional[str]:
    """
    Si `model` viene informado (palabra disparadora en WhatsApp → modelo Ollama
    específico, p. ej. "brashkie" → mistral), se prueba SOLO ese modelo local
    y no se cae a GPT/Gemini/Claude — si falla, el caller cae a la plantilla
    local de personality.py.

    Sin `model`, orden de prioridad de siempre:
      1. Ollama  — IA local, sin costo, sin internet (modelo default)
      2. GPT     — si hay OPENAI_API_KEY
      3. Gemini  — si hay GEMINI_API_KEY
      4. Claude  — si hay ANTHROPIC_API_KEY
    """
    import httpx
    from ai.ollama_client import chat as ollama_chat, is_available

    if model:
        try:
            if await is_available(model):
                text = await ollama_chat(prompt, system, model=model)
                if text:
                    log.debug(f'Hepein → Ollama ({model})')
                    return text
        except Exception as e:
            log.debug(f'Ollama ({model}) no disponible: {e}')
        return None

    openai_key  = os.getenv('OPENAI_API_KEY')
    claude_key  = os.getenv('ANTHROPIC_API_KEY')
    gemini_key  = os.getenv('GEMINI_API_KEY')

    # ── Ollama (IA local — primera opción) ───────────────────────────────
    try:
        if await is_available():
            text = await ollama_chat(prompt, system)
            if text:
                log.debug('Hepein → Ollama (local)')
                return text
    except Exception as e:
        log.debug(f'Ollama no disponible: {e}')

    async with httpx.AsyncClient(timeout=25) as http:

        # ── GPT ──────────────────────────────────────────────────────────
        if use_gpt and openai_key:
            try:
                r = await http.post(
                    'https://api.openai.com/v1/chat/completions',
                    headers={'Authorization': f'Bearer {openai_key}'},
                    json={
                        'model':       'gpt-4o-mini',
                        'messages':    [{'role': 'system', 'content': system}, {'role': 'user', 'content': prompt}],
                        'max_tokens':  300,
                        'temperature': 0.85,
                    },
                )
                if r.status_code == 200:
                    text = r.json()['choices'][0]['message']['content'].strip()
                    if text:
                        log.debug('Hepein → GPT')
                        return text
            except Exception as e:
                log.warning(f'Hepein GPT error: {e}')

        # ── Gemini ───────────────────────────────────────────────────────
        if gemini_key:
            try:
                r = await http.post(
                    f'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={gemini_key}',
                    json={
                        'contents': [{'parts': [{'text': f'{system}\n\n{prompt}'}]}],
                        'generationConfig': {'temperature': 0.85, 'maxOutputTokens': 300},
                    },
                )
                if r.status_code == 200:
                    text = r.json().get('candidates', [{}])[0].get('content', {}).get('parts', [{}])[0].get('text', '').strip()
                    if text:
                        log.debug('Hepein → Gemini')
                        return text
            except Exception as e:
                log.warning(f'Hepein Gemini error: {e}')

        # ── Claude ───────────────────────────────────────────────────────
        if claude_key:
            try:
                r = await http.post(
                    'https://api.anthropic.com/v1/messages',
                    headers={'x-api-key': claude_key, 'anthropic-version': '2023-06-01'},
                    json={
                        'model':       'claude-haiku-4-5-20251001',
                        'max_tokens':  300,
                        'system':      system,
                        'messages':    [{'role': 'user', 'content': prompt}],
                    },
                )
                if r.status_code == 200:
                    text = r.json().get('content', [{}])[0].get('text', '').strip()
                    if text:
                        log.debug('Hepein → Claude')
                        return text
            except Exception as e:
                log.warning(f'Hepein Claude error: {e}')

    return None

# ─── Routes ───────────────────────────────────────────────────────────────────

@router.post('/record')
async def record_message(req: RecordRequest, bg: BackgroundTasks):
    """
    Registra un mensaje del grupo para entrenamiento.
    Fire-and-forget: el bot llama esto sin esperar respuesta.
    """
    def _do():
        try:
            from ai.trainer import record
            record(req.group_jid, req.sender_jid, req.text, req.is_reply)
        except Exception as e:
            log.warning(f'record_message bg: {e}')
    bg.add_task(_do)
    return {'success': True}


@router.post('/respond')
async def hepein_respond(req: RespondRequest):
    """
    Genera una respuesta de Hepein usando el estilo aprendido del grupo.
    Combina: perfil del grupo + perfil del usuario + modo de personalidad.
    """
    try:
        from ai.trainer   import get_profile, get_group_style
        from ai.personality import get_mode
        from ai.imitation import adapt_response

        # Obtener datos de estilo en paralelo
        loop = asyncio.get_event_loop()
        user_profile, group_style = await asyncio.gather(
            loop.run_in_executor(None, lambda: get_profile(req.sender_jid)),
            loop.run_in_executor(None, lambda: get_group_style(req.group_jid)),
        )

        # Modo de personalidad
        mode = req.mode or get_mode(req.group_jid)

        if req.use_gpt:
            system  = _build_system_prompt(group_style, user_profile, mode, prompt=req.prompt)
            ai_text = await _call_ai(req.prompt, system, model=req.model)
        else:
            ai_text = None

        # Fallback: motor local de personalidad
        if not ai_text:
            from ai.personality import generate_response
            user_style_dict = {
                'avg_len':      user_profile.avg_len,
                'emoji_freq':   user_profile.emoji_freq,
                'common_words': user_profile.common_words,
            } if user_profile.msg_count >= 15 else None
            ai_text = generate_response(
                req.intent, req.prompt,
                jid=req.group_jid,
                use_humor=req.use_humor,
                history=req.history,
                user_style=user_style_dict,
            )

        # Post-procesar con imitation.py si hay perfil
        if user_profile.msg_count >= 15:
            user_style_dict = {
                'avg_len':      user_profile.avg_len,
                'emoji_freq':   user_profile.emoji_freq,
                'common_words': user_profile.common_words,
            }
            ai_text = adapt_response(ai_text, user_style_dict)

        return {
            'success': True,
            'data': {
                'text':       ai_text,
                'mode':       mode,
                'has_profile': user_profile.msg_count >= 15,
                'group_msgs': group_style.msg_count,
            },
        }

    except Exception as e:
        log.error(f'hepein_respond: {e}', exc_info=True)
        return JSONResponse({'success': False, 'error': str(e)}, status_code=500)


@router.post('/imitate')
async def hepein_imitate(req: ImitateRequest):
    """
    Genera una respuesta imitando el estilo de un usuario específico.
    El bot habla "como si fuera" el target_jid.
    """
    try:
        from ai.trainer   import get_profile
        from ai.imitation import adapt_response

        loop = asyncio.get_event_loop()
        target_profile = await loop.run_in_executor(None, lambda: get_profile(req.target_jid))

        system  = _build_imitate_prompt(target_profile, req.target_jid)
        ai_text = await _call_ai(req.prompt, system)

        if not ai_text:
            ai_text = '...'

        # Post-procesar
        if target_profile.msg_count >= 15:
            ai_text = adapt_response(ai_text, {
                'avg_len':      target_profile.avg_len,
                'emoji_freq':   target_profile.emoji_freq,
                'common_words': target_profile.common_words,
            })

        return {
            'success': True,
            'data': {
                'text':       ai_text,
                'has_profile': target_profile.msg_count >= 15,
                'msg_count':  target_profile.msg_count,
            },
        }

    except Exception as e:
        log.error(f'hepein_imitate: {e}', exc_info=True)
        return JSONResponse({'success': False, 'error': str(e)}, status_code=500)


@router.get('/profile/{jid}')
async def get_user_profile(jid: str, days: int = 45):
    """Devuelve el perfil de estilo aprendido de un usuario."""
    try:
        from ai.trainer import get_profile
        from dataclasses import asdict
        loop    = asyncio.get_event_loop()
        profile = await loop.run_in_executor(None, lambda: get_profile(jid, days))
        return {'success': True, 'data': asdict(profile)}
    except Exception as e:
        return JSONResponse({'success': False, 'error': str(e)}, status_code=500)


@router.get('/group/{group_jid}')
async def get_group_profile(group_jid: str, days: int = 30):
    """Devuelve el perfil de estilo aprendido del grupo."""
    try:
        from ai.trainer import get_group_style
        from dataclasses import asdict
        loop  = asyncio.get_event_loop()
        style = await loop.run_in_executor(None, lambda: get_group_style(group_jid, days))
        return {'success': True, 'data': asdict(style)}
    except Exception as e:
        return JSONResponse({'success': False, 'error': str(e)}, status_code=500)


@router.delete('/profile/{jid}')
async def delete_profile(jid: str):
    """Elimina todos los datos de mensajes de un usuario (RGPD / privacidad)."""
    try:
        from ai.trainer import delete_user_data
        loop    = asyncio.get_event_loop()
        deleted = await loop.run_in_executor(None, lambda: delete_user_data(jid))
        return {'success': True, 'data': {'deleted_rows': deleted}}
    except Exception as e:
        return JSONResponse({'success': False, 'error': str(e)}, status_code=500)


@router.get('/stats')
async def hepein_stats():
    """Estadísticas del pipeline Parquet."""
    try:
        from ai.trainer import stats
        return {'success': True, 'data': stats()}
    except Exception as e:
        return JSONResponse({'success': False, 'error': str(e)}, status_code=500)
