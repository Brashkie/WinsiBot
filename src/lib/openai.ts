// Las dos llamadas a OpenAI que usa el bot (#gpt e #imagine), con el fetch de
// Node. El SDK oficial se usaba para eso nada más y era la dependencia más
// grande de node_modules; acá son dos POST con JSON.
//
// Un error trae `status` como el del SDK, así gpt.ts sigue distinguiendo el
// 429 (límite) del 401 (clave) sin cambiar.

import { config } from '@config'

const BASE = 'https://api.openai.com/v1'

export type Mensaje = { role: 'system' | 'user' | 'assistant'; content: string }

async function llamar<T>(ruta: string, cuerpo: unknown, timeoutMs: number): Promise<T> {
  const res = await fetch(`${BASE}${ruta}`, {
    method:  'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${config.openaiKey}` },
    body:    JSON.stringify(cuerpo),
    signal:  AbortSignal.timeout(timeoutMs),
  })
  const data = await res.json().catch(() => null) as any
  if (!res.ok) {
    throw Object.assign(new Error(data?.error?.message ?? `OpenAI: HTTP ${res.status}`), { status: res.status })
  }
  return data as T
}

export async function chat(messages: Mensaje[], opts: { model: string; max_tokens?: number; temperature?: number }): Promise<string | undefined> {
  const r = await llamar<{ choices: Array<{ message?: { content?: string | null } }> }>(
    '/chat/completions', { ...opts, messages }, 60_000)
  return r.choices[0]?.message?.content ?? undefined
}

export async function imagen(prompt: string): Promise<string | undefined> {
  const r = await llamar<{ data: Array<{ url?: string }> }>(
    '/images/generations', { model: 'dall-e-3', prompt, n: 1, size: '1024x1024', quality: 'standard' }, 120_000)
  return r.data[0]?.url
}
