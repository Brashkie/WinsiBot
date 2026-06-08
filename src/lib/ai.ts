// ─────────────────────────────────────────────────────────────────────────────
//  WinsiBot — CLIENTE IA MULTI-MODELO
//  Soporta GPT, Claude y Gemini con historial de conversación y rate limiting.
//
//  Uso:
//    import { chat, clearHistory } from '@lib/ai.js'
//    const res = await chat('Hola!', senderJid)
//    if (res.success) sock.sendMessage(jid, { text: res.text })
// ─────────────────────────────────────────────────────────────────────────────

import OpenAI  from 'openai'
import axios   from 'axios'
import { config } from '../config.js'
import { logger }  from '../core/logger.js'

// ─── Tipos públicos ───────────────────────────────────────────────────────────

export type AIModel  = 'gpt' | 'claude' | 'gemini'
export type AIMsg    = { role: 'user' | 'assistant'; content: string }
export type AIResult =
  | { success: true;  text: string; model: string; tokensUsed: number }
  | { success: false; error: string; rateLimited?: boolean }

export interface ChatOptions {
  model?:       AIModel
  system?:      string
  temperature?: number
  maxTokens?:   number
}

// ─────────────────────────────────────────────────────────────────────────────
//  HISTORIAL DE CONVERSACIÓN
// ─────────────────────────────────────────────────────────────────────────────

const MAX_HISTORY  = 12
const conversions  = new Map<string, AIMsg[]>()

function getHistory(jid: string): AIMsg[] {
  if (!conversions.has(jid)) conversions.set(jid, [])
  return conversions.get(jid)!
}

function pushHistory(jid: string, role: 'user' | 'assistant', content: string): void {
  const h = getHistory(jid)
  h.push({ role, content })
  if (h.length > MAX_HISTORY) h.splice(0, h.length - MAX_HISTORY)
}

export function clearHistory(jid: string): void {
  conversions.delete(jid)
}

export function clearAllHistory(): void {
  conversions.clear()
}

export function getHistoryLength(jid: string): number {
  return conversions.get(jid)?.length ?? 0
}

// ─────────────────────────────────────────────────────────────────────────────
//  RATE LIMITING POR USUARIO
// ─────────────────────────────────────────────────────────────────────────────

const MAX_PER_HOUR = 20
const rateBuckets  = new Map<string, number[]>()

function checkRate(jid: string): boolean {
  const now  = Date.now()
  const hour = 3_600_000
  const old  = (rateBuckets.get(jid) ?? []).filter(t => now - t < hour)
  if (old.length >= MAX_PER_HOUR) return false
  old.push(now)
  rateBuckets.set(jid, old)
  return true
}

export function getRateRemaining(jid: string): number {
  const now  = Date.now()
  const used = (rateBuckets.get(jid) ?? []).filter(t => now - t < 3_600_000).length
  return Math.max(0, MAX_PER_HOUR - used)
}

// ─────────────────────────────────────────────────────────────────────────────
//  SISTEMA PROMPT POR DEFECTO
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_SYSTEM = `Eres ${config.botName}, un asistente de WhatsApp inteligente, amigable y conciso. Responde siempre en español a menos que el usuario escriba en otro idioma. Sé breve: máximo 3 párrafos salvo que pidan algo extenso.`

// ─────────────────────────────────────────────────────────────────────────────
//  GPT (OpenAI)
// ─────────────────────────────────────────────────────────────────────────────

let _openai: OpenAI | null = null
function getOpenAI(): OpenAI | null {
  if (_openai) return _openai
  const key = (config as any).openaiKey ?? process.env.OPENAI_API_KEY
  if (!key) return null
  _openai = new OpenAI({ apiKey: key })
  return _openai
}

async function askGPT(
  prompt: string,
  jid: string,
  opts: ChatOptions = {},
): Promise<AIResult> {
  const client = getOpenAI()
  if (!client) return { success: false, error: 'OpenAI no configurado (OPENAI_API_KEY vacía)' }

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: 'system', content: opts.system ?? DEFAULT_SYSTEM },
    ...getHistory(jid).map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    { role: 'user',   content: prompt },
  ]

  const res = await client.chat.completions.create({
    model:       'gpt-4o-mini',
    messages,
    max_tokens:  opts.maxTokens   ?? 1_000,
    temperature: opts.temperature ?? 0.75,
  })

  const text = res.choices[0]?.message?.content?.trim() ?? ''
  if (!text) return { success: false, error: 'GPT devolvió respuesta vacía' }

  pushHistory(jid, 'user',      prompt)
  pushHistory(jid, 'assistant', text)

  const tokensUsed = res.usage?.total_tokens ?? 0
  return { success: true, text, model: res.model, tokensUsed }
}

// ─────────────────────────────────────────────────────────────────────────────
//  CLAUDE (Anthropic)
// ─────────────────────────────────────────────────────────────────────────────

async function askClaude(
  prompt: string,
  jid: string,
  opts: ChatOptions = {},
): Promise<AIResult> {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) return { success: false, error: 'Anthropic no configurado (ANTHROPIC_API_KEY vacía)' }

  const messages = [
    ...getHistory(jid),
    { role: 'user' as const, content: prompt },
  ]

  const res = await axios.post(
    'https://api.anthropic.com/v1/messages',
    {
      model:      'claude-haiku-4-5-20251001',
      max_tokens: opts.maxTokens   ?? 1_000,
      system:     opts.system      ?? DEFAULT_SYSTEM,
      messages,
    },
    {
      headers: {
        'x-api-key':         key,
        'anthropic-version': '2023-06-01',
        'Content-Type':      'application/json',
      },
      timeout: 30_000,
    },
  )

  const text: string = res.data?.content?.[0]?.text?.trim() ?? ''
  if (!text) return { success: false, error: 'Claude devolvió respuesta vacía' }

  pushHistory(jid, 'user',      prompt)
  pushHistory(jid, 'assistant', text)

  return {
    success:    true,
    text,
    model:      'claude-haiku-4-5',
    tokensUsed: (res.data?.usage?.input_tokens ?? 0) + (res.data?.usage?.output_tokens ?? 0),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  GEMINI (Google)
// ─────────────────────────────────────────────────────────────────────────────

async function askGemini(
  prompt: string,
  _jid: string,
  opts: ChatOptions = {},
): Promise<AIResult> {
  const key = process.env.GEMINI_API_KEY
  if (!key) return { success: false, error: 'Gemini no configurado (GEMINI_API_KEY vacía)' }

  const res = await axios.post(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`,
    {
      contents:         [{ parts: [{ text: `${opts.system ?? DEFAULT_SYSTEM}\n\n${prompt}` }] }],
      generationConfig: {
        temperature:     opts.temperature ?? 0.75,
        maxOutputTokens: opts.maxTokens   ?? 1_000,
      },
    },
    { timeout: 30_000 },
  )

  const text: string = res.data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? ''
  if (!text) return { success: false, error: 'Gemini devolvió respuesta vacía' }

  return { success: true, text, model: 'gemini-1.5-flash', tokensUsed: 0 }
}

// ─────────────────────────────────────────────────────────────────────────────
//  CHAT UNIFICADO (con fallback automático)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Envía un mensaje al modelo elegido. Si falla, intenta el siguiente disponible.
 * Mantiene historial de conversación por JID y aplica rate limiting.
 */
export async function chat(
  prompt:  string,
  jid:     string,
  opts:    ChatOptions = {},
): Promise<AIResult> {
  if (!checkRate(jid)) {
    return {
      success:     false,
      error:       `Límite alcanzado (${MAX_PER_HOUR} mensajes/hora). Intenta más tarde.`,
      rateLimited: true,
    }
  }

  const model = opts.model ?? 'gpt'

  // Orden de fallback según el modelo preferido
  const order: Array<() => Promise<AIResult>> = {
    gpt:    [() => askGPT(prompt, jid, opts),    () => askGemini(prompt, jid, opts),  () => askClaude(prompt, jid, opts)],
    claude: [() => askClaude(prompt, jid, opts), () => askGPT(prompt, jid, opts),     () => askGemini(prompt, jid, opts)],
    gemini: [() => askGemini(prompt, jid, opts), () => askGPT(prompt, jid, opts),     () => askClaude(prompt, jid, opts)],
  }[model]

  let last: AIResult = { success: false, error: 'Sin modelos disponibles' }

  for (const fn of order) {
    try {
      const res = await fn()
      if (res.success) return res
      last = res
    } catch (err: any) {
      logger.warn({ err }, `AI: error en modelo ${model}`)
      last = { success: false, error: err?.message ?? 'Error desconocido' }
    }
  }

  return last
}

// ─────────────────────────────────────────────────────────────────────────────
//  FUNCIONES ESPECIALES
// ─────────────────────────────────────────────────────────────────────────────

/** Resume un texto largo usando el modelo disponible. */
export async function summarize(text: string, jid = 'system'): Promise<AIResult> {
  return chat(`Resume el siguiente texto de forma concisa:\n\n${text}`, jid, {
    temperature: 0.3,
    maxTokens:   400,
  })
}

/** Genera una respuesta con un system prompt personalizado (sin historial). */
export async function oneShot(
  prompt: string,
  system: string,
  opts:   Omit<ChatOptions, 'system'> = {},
): Promise<AIResult> {
  const tmpJid = `oneshot_${Date.now()}`
  const res    = await chat(prompt, tmpJid, { ...opts, system })
  clearHistory(tmpJid)
  return res
}

// ─────────────────────────────────────────────────────────────────────────────
//  LIMPIEZA PERIÓDICA DE HISTORIAL (cada 6 h)
// ─────────────────────────────────────────────────────────────────────────────

setInterval(() => {
  const before = conversions.size
  // Eliminar conversaciones sin actividad reciente (solo las que ya pasaron 6h)
  // En este diseño limpiamos todo — en producción se podrían trackear timestamps
  conversions.clear()
  rateBuckets.clear()
  if (before > 0) logger.debug(`AI: historial limpiado (${before} conversaciones)`)
}, 6 * 3_600_000).unref()

// Re-exportar helpers individuales por si se necesitan directamente
export { askGPT, askClaude, askGemini }
