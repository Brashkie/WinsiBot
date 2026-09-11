// Hecho por HepeinBaileys

import axios, { type AxiosInstance } from 'axios'
import axiosRetry from 'axios-retry'
import { config } from '@config'
import { logger } from '@core/logger.js'
import { pythonCircuit } from '@lib/circuitBreaker.js'
import type { PythonApiResponse } from '../types/index.js'

// ─── Clientes HTTP ────────────────────────────────────────────────────────────
const client: AxiosInstance = axios.create({
  baseURL: config.pythonApiUrl,
  timeout: 5_000,
  headers: { 'Content-Type': 'application/json' },
})

// Cliente para el servidor Rust (sin reintentos — ya es sub-ms)
// Antes mandaba process.env.RUST_API_KEY (nunca documentado en .env.example,
// siempre vacío) — Rust rechaza con 401 cualquier x-api-key que no matchee,
// así que TODO el camino rápido de NLP en Rust caía en silencio a Python.
const rustClient: AxiosInstance = axios.create({
  baseURL: config.rustApiUrl,
  timeout: 300,   // 300ms máximo; si no responde, cae a Python
  headers: { 'Content-Type': 'application/json', 'x-api-key': config.sessionApiKey },
})

// 1 solo reintento — este cliente está en el camino crítico de cada mensaje
// (vía hepein.respond, etc.). Con 3 reintentos + backoff exponencial, una
// Python lenta/degradada podía tardar 20-30s en fallar definitivamente,
// dejando ocupado un slot del semáforo de concurrencia de handler.ts todo
// ese tiempo. Mejor fallar rápido — el bot ya maneja Python no disponible.
axiosRetry(client, {
  retries:        1,
  retryDelay:     axiosRetry.exponentialDelay,
  retryCondition: (err) => axiosRetry.isNetworkOrIdempotentRequestError(err),
})

// ─── Circuito ─────────────────────────────────────────────────────────────────
// Solo cuentan como fallo del SERVICIO los errores de red, los timeouts y los
// 5xx. Un 4xx significa que la petición estaba mal, no que Python se cayó:
// contarlo abriría el circuito por un bug nuestro y dejaría sin IA a todo el
// bot. Ver lib/circuitBreaker.ts.
function isServiceFailure(err: any): boolean {
  const status = err?.response?.status
  if (typeof status === 'number') return status >= 500
  return true   // sin respuesta = red caída, timeout o DNS
}

/** Respuesta inmediata cuando el circuito está abierto — sin tocar la red. */
function circuitOpenResponse<T>(): PythonApiResponse<T> {
  return { success: false, error: 'Python API no disponible (circuito abierto)' } as PythonApiResponse<T>
}

// ─── Base ─────────────────────────────────────────────────────────────────────
export async function pythonPost<T>(
  endpoint:  string,
  data:      Record<string, unknown>,
  timeoutMs?: number,
): Promise<PythonApiResponse<T>> {
  if (!pythonCircuit.canAttempt()) return circuitOpenResponse<T>()
  try {
    const res = await client.post<PythonApiResponse<T>>(
      endpoint, data,
      timeoutMs != null ? { timeout: timeoutMs } : undefined,
    )
    pythonCircuit.recordSuccess()
    return res.data
  } catch (err: any) {
    if (isServiceFailure(err)) pythonCircuit.recordFailure()
    if (err?.code === 'ECONNREFUSED' || err?.cause?.code === 'ECONNREFUSED') {
      return { success: false, error: 'Flask offline' }
    }
    logger.error({
      endpoint,
      code:    err?.code,
      status:  err?.response?.status,
      message: err?.message,
    }, 'Error llamando Python API')
    return { success: false, error: 'Python API no disponible' }
  }
}

export async function pythonGet<T>(
  endpoint: string,
  params?:  Record<string, string>,
): Promise<PythonApiResponse<T>> {
  if (!pythonCircuit.canAttempt()) return circuitOpenResponse<T>()
  try {
    const res = await client.get<PythonApiResponse<T>>(endpoint, { params })
    pythonCircuit.recordSuccess()
    return res.data
  } catch (err: any) {
    if (isServiceFailure(err)) pythonCircuit.recordFailure()
    if (err?.code === 'ECONNREFUSED' || err?.cause?.code === 'ECONNREFUSED') {
      return { success: false, error: 'Flask offline' }
    }
    logger.error({
      endpoint,
      code:    err?.code,
      status:  err?.response?.status,
      message: err?.message,
    }, 'Error llamando Python API')
    return { success: false, error: 'Python API no disponible' }
  }
}

export async function pythonDelete<T>(
  endpoint: string,
): Promise<PythonApiResponse<T>> {
  try {
    const res = await client.delete<PythonApiResponse<T>>(endpoint)
    return res.data
  } catch (err: any) {
    if (err?.code === 'ECONNREFUSED' || err?.cause?.code === 'ECONNREFUSED') {
      return { success: false, error: 'Flask offline' }
    }
    logger.error({
      endpoint,
      code:    err?.code,
      status:  err?.response?.status,
      message: err?.message,
    }, 'Error llamando Python API')
    return { success: false, error: 'Python API no disponible' }
  }
}

export async function checkSpamText(text: string): Promise<boolean> {
  const res = await pythonPost<{ is_spam: boolean; confidence: number }>('/api/v1/ml/predict/spam', { text })
  return res.data?.is_spam ?? false
}

// ─── NLP ──────────────────────────────────────────────────────────────────────
export interface NLPIntent {
  text:        string
  intents:     string[]
  primary:     string
  is_question: boolean
}

interface RustNlpResult {
  ok:         boolean
  intent:     string
  confidence: number
  method:     string
}

// Intenta Rust primero (regexes, sub-ms); si dice "unknown" o falla → Python
export async function analyzeIntent(text: string): Promise<NLPIntent | null> {
  try {
    const rustRes = await rustClient.post<RustNlpResult>('/nlp/fast', { text })
    if (rustRes.data?.ok && rustRes.data.intent !== 'unknown') {
      const intent = rustRes.data.intent
      return {
        text,
        intents:     [intent],
        primary:     intent,
        is_question: text.trimEnd().endsWith('?'),
      }
    }
  } catch {
    // Rust offline o timeout — cae a Python silenciosamente
  }

  const res = await pythonPost<NLPIntent>('/api/v1/ml/nlp/intent', { text })
  return res.success ? res.data ?? null : null
}

// ─── AI conversaciones (DuckDB via Rust) ──────────────────────────────────────

export interface AIContext {
  ok:      boolean
  history: Array<{ text: string; intent: string; reply: string; ts: number }>
  style: {
    total_msgs:    number
    avg_len:       number
    emoji_freq:    number
    question_freq: number
    common_words:  string[]
  } | null
}

export interface LearnPayload {
  sender: string
  gjid:   string
  text:   string
  intent: string
  reply:  string
  mode:   string
}

export async function getAIContext(sender: string, limit = 8): Promise<AIContext | null> {
  try {
    const res = await rustClient.get<AIContext>(
      `/ai/context/${encodeURIComponent(sender)}`,
      { params: { limit: String(limit) } },
    )
    return res.data?.ok ? res.data : null
  } catch {
    return null
  }
}

export async function learnConversation(payload: LearnPayload): Promise<void> {
  try {
    await rustClient.post('/ai/learn', payload)
  } catch {
    // fire-and-forget — ignorar errores
  }
}