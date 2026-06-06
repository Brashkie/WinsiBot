// Hecho por HepeinBaileys

import axios, { type AxiosInstance } from 'axios'
import axiosRetry from 'axios-retry'
import { config } from '@config'
import { logger } from '@core/logger.js'
import type { PythonApiResponse } from '../types/index.js'

// ─── Clientes HTTP ────────────────────────────────────────────────────────────
const client: AxiosInstance = axios.create({
  baseURL: config.pythonApiUrl,
  timeout: 5_000,
  headers: { 'Content-Type': 'application/json' },
})

// Cliente para el servidor Rust (sin reintentos — ya es sub-ms)
const rustClient: AxiosInstance = axios.create({
  baseURL: config.rustApiUrl,
  timeout: 300,   // 300ms máximo; si no responde, cae a Python
  headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.RUST_API_KEY ?? '' },
})

axiosRetry(client, {
  retries:        3,
  retryDelay:     axiosRetry.exponentialDelay,
  retryCondition: (err) => axiosRetry.isNetworkOrIdempotentRequestError(err),
})

// ─── Base ─────────────────────────────────────────────────────────────────────
export async function pythonPost<T>(
  endpoint: string,
  data:     Record<string, unknown>,
): Promise<PythonApiResponse<T>> {
  try {
    const res = await client.post<PythonApiResponse<T>>(endpoint, data)
    return res.data
  } catch (err: any) {
    if (err?.code === 'ECONNREFUSED' || err?.cause?.code === 'ECONNREFUSED') {
      return { success: false, error: 'Flask offline' }
    }
    logger.error({ err, endpoint }, 'Error llamando Python API')
    return { success: false, error: 'Python API no disponible' }
  }
}

export async function pythonGet<T>(
  endpoint: string,
  params?:  Record<string, string>,
): Promise<PythonApiResponse<T>> {
  try {
    const res = await client.get<PythonApiResponse<T>>(endpoint, { params })
    return res.data
  } catch (err: any) {
    if (err?.code === 'ECONNREFUSED' || err?.cause?.code === 'ECONNREFUSED') {
      return { success: false, error: 'Flask offline' }
    }
    logger.error({ err, endpoint }, 'Error llamando Python API')
    return { success: false, error: 'Python API no disponible' }
  }
}

// ─── Fast Process via Cython ──────────────────────────────────────────────────
export interface FastProcessResult {
  cmd:      string
  args:     string[]
  prefix:   string
  is_group: boolean
  is_owner: boolean
  allowed:  boolean
  hits:     number
  has_cmd:  boolean
}

export async function fastProcess(
  text:      string,
  prefixes:  string[],
  sender:    string,
  jid:       string,
  ownerJids: string[],
): Promise<FastProcessResult | null> {
  try {
    const res = await Promise.race([
      pythonPost<FastProcessResult>('/api/v1/fast/process', {
        text, prefixes, sender, jid,
        owner_jids: ownerJids,
        max_hits: 8, ttl: 10,
      }),
      new Promise<null>(r => setTimeout(() => r(null), 200)), // ← max 200ms
    ])
    return res?.data ?? null
  } catch {
    return null
  }
}

// ─── Rate limit via Cython ────────────────────────────────────────────────────
export interface RateLimitResult {
  allowed: boolean
  stats:   { hits: number; sender: string; last_hit: number; time_since: number }
}

export async function checkRateLimit(
  sender:   string,
  maxHits = 8,
  window  = 10.0,
): Promise<RateLimitResult | null> {
  const res = await pythonPost<RateLimitResult>('/api/v1/ratelimit/check', {
    sender,
    max_hits: maxHits,
    window,
  })
  return res.data ?? null
}

export async function checkSpamText(text: string): Promise<boolean> {
  const res = await pythonPost<{ is_spam: boolean }>('/api/v1/ratelimit/spam/check', { text })
  return res.data?.is_spam ?? false
}

// ─── Cache stats ──────────────────────────────────────────────────────────────
export interface CacheStats {
  rate_entries:     number
  cooldown_entries: number
  group_entries:    number
  msg_entries:      number
}

export async function getCacheStats(): Promise<CacheStats | null> {
  const res = await pythonGet<CacheStats>('/api/v1/fast/cache/stats')
  return res.data ?? null
}

// ─── Usuarios ─────────────────────────────────────────────────────────────────
export interface UserData {
  jid:       string
  pushName:  string
  isOwner:   boolean
  banned:    boolean
  warns:     number
  exp:       number
  level:     number
  premium:   boolean
  createdAt: string
  updatedAt: string
}

export async function getOrCreateUser(
  jid:      string,
  pushName: string,
  isOwner:  boolean,
  addExp  = true,
): Promise<UserData | null> {
  const res = await pythonPost<UserData>('/api/v1/users', {
    jid, pushName, isOwner,
    addExp,
    expAmount: 5,
  })
  return res.success ? res.data ?? null : null
}

export async function warnUser(jid: string): Promise<number> {
  const res = await pythonPost<{ warns: number }>(`/api/v1/users/${jid}/warn`, {})
  return res.data?.warns ?? 0
}

// ─── Grupos ───────────────────────────────────────────────────────────────────
export interface GroupData {
  jid:      string
  name:     string
  antilink: boolean
  antispam: boolean
  welcome:  boolean
  muted:    boolean
}

export async function getOrCreateGroup(jid: string, name = ''): Promise<GroupData | null> {
  const res = await pythonGet<GroupData>(`/api/v1/groups/${jid}`)
  if (res.success) return res.data ?? null
  const create = await pythonPost<GroupData>('/api/v1/groups', { jid, name })
  return create.data ?? null
}

export async function updateGroup(data: Partial<GroupData> & { jid: string }): Promise<void> {
  await pythonPost('/api/v1/groups', data)
}

// ─── Mensajes ─────────────────────────────────────────────────────────────────
export async function logMessage(data: {
  id:       string
  jid:      string
  sender:   string
  pushName: string
  text:     string
  command:  string
  isGroup:  boolean
  isOwner:  boolean
}): Promise<void> {
  await pythonPost('/api/v1/messages', data)
}

// ─── Stats ────────────────────────────────────────────────────────────────────
export interface BotStats {
  total_messages: number
  total_users:    number
  total_commands: number
  messages_today: number
  commands_today: number
  banned_users:   number
  premium_users:  number
  generated_at:   string
}

export async function getBotStats(): Promise<BotStats | null> {
  const res = await pythonGet<BotStats>('/api/v1/stats')
  return res.success ? res.data ?? null : null
}

export async function getTopCommands(): Promise<Array<{ command: string; count: number }>> {
  const res = await pythonGet<Array<{ command: string; count: number }>>('/api/v1/stats/top-commands')
  return res.data ?? []
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

  const res = await pythonPost<NLPIntent>('/api/v1/nlp/intent', { text })
  return res.success ? res.data ?? null : null
}

export async function analyzeSimilarity(text1: string, text2: string): Promise<number> {
  const res = await pythonPost<{ similarity: number }>('/api/v1/nlp/similarity', { text1, text2 })
  return res.data?.similarity ?? 0
}

// ─── Mensajes pendientes ──────────────────────────────────────────────────────
export interface PendingMessage {
  id:        string
  jid:       string
  sender:    string
  text:      string
  command:   string
  timestamp: string
  processed: boolean
}

export async function getPendingCount(minutes = 30): Promise<number> {
  const res = await pythonGet<{ count: number }>('/api/v1/pending/count', {
    minutes: String(minutes),
  })
  return res.data?.count ?? 0
}

export async function getPendingMessages(minutes = 30): Promise<PendingMessage[]> {
  const res = await pythonGet<PendingMessage[]>('/api/v1/pending', {
    minutes: String(minutes),
  })
  return res.data ?? []
}

export async function markPendingProcessed(ids: string[]): Promise<void> {
  await pythonPost('/api/v1/pending/processed', { ids })
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