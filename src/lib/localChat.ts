// Hablar con la IA local —Cosxamix, o un Ollama— por su API de chat en
// formato OpenAI (`/v1/chat/completions`), sin la Session API de por medio.
//
// Lo usan #gpt y la traducción del prompt de #imagine. La IA del grupo
// (Hepein) sigue yendo por la Session API, que le suma el estilo del grupo y
// el historial (ai_chat.rs).
//
// Devuelve null si no hay IA local o no contestó: quien llama decide qué hacer
// (OpenAI si hay clave, o el texto como vino).

import { MODELO_POR_DEFECTO, URL_POR_DEFECTO } from './cosxamixLaunch.js'

export type MensajeChat = { role: 'system' | 'user' | 'assistant'; content: string }

export const baseLocal = (): string => (process.env.OLLAMA_URL?.trim() || URL_POR_DEFECTO).replace(/\/+$/, '')

export async function chatLocal(
  messages: MensajeChat[],
  opts: { max_tokens?: number; temperature?: number; timeoutMs?: number } = {},
  f: typeof fetch = fetch,
): Promise<string | null> {
  try {
    const r = await f(`${baseLocal()}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal: AbortSignal.timeout(opts.timeoutMs ?? 120_000),
      body: JSON.stringify({
        model: process.env.OLLAMA_MODEL?.trim() || MODELO_POR_DEFECTO,
        temperature: opts.temperature ?? 0.7,
        max_tokens: opts.max_tokens ?? 512,
        messages,
      }),
    })
    if (!r.ok) return null
    const data = (await r.json()) as { choices?: Array<{ message?: { content?: string | null } }> }
    const t = data.choices?.[0]?.message?.content?.trim()
    return t || null
  } catch {
    return null
  }
}
