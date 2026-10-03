// Hecho por HepeinBaileys

import axios, { type AxiosInstance } from 'axios'
import axiosRetry from 'axios-retry'
import { config } from '@config'
import { logger } from '@core/logger.js'
import { pythonCircuit, rustCircuit } from '@lib/circuitBreaker.js'
import { venvPythonPath } from '@lib/platform.js'
import { existsSync } from 'node:fs'
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
/**
 * ¿Hay un entorno de Python instalado?
 *
 * Desde la 8.11.0 Python es opcional: lo único que queda allá son los comandos
 * de anime, que son redes neuronales con torch. Sin venv no hay nada que
 * llamar, así que conviene decirlo de entrada en vez de intentar la petición,
 * fallar por conexión rechazada y que el usuario vea un error genérico después
 * de esperar.
 *
 * Se evalúa una vez: instalar Python con el bot corriendo es un caso que no
 * vale una llamada al sistema de archivos por petición.
 */
let _pythonInstalado: boolean | null = null
export function pythonInstalado(): boolean {
  if (_pythonInstalado === null) _pythonInstalado = existsSync(venvPythonPath())
  return _pythonInstalado
}

/** El error que ven los comandos cuando no hay Python instalado. */
export const SIN_PYTHON = 'Esta función necesita Python instalado (ver python/requirements-optional.txt)'

export async function pythonPost<T>(
  endpoint:  string,
  data:      Record<string, unknown>,
  timeoutMs?: number,
): Promise<PythonApiResponse<T>> {
  if (!pythonInstalado()) return { success: false, error: SIN_PYTHON } as PythonApiResponse<T>
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


// ─── NLP ──────────────────────────────────────────────────────────────────────
export interface NLPIntent {
  text:    string
  primary: string
}

interface RustNlpResult {
  ok:         boolean
  intent:     string
  confidence: number
  method:     string
}

/**
 * Intención del mensaje, resuelta por Rust (`/nlp/fast`, reglas, sub-ms).
 *
 * Devuelve `null` cuando Rust no está seguro o no responde, y eso es
 * deliberado: cada consumidor tiene su propia regex local de respaldo
 * (`LOCAL_TOXIC` en antitoxic, `LOCAL_NSFW` en nsfw, la de caracteres
 * repetidos en antispam) y solo la evalúa si acá no hay respuesta.
 *
 * Antes, con `unknown` se consultaba a Python — y ese respaldo era PEOR que
 * no tener ninguno. El vocabulario de Python era `saludo`/`despedida`/`ayuda`/
 * `gracias`/`insulto`/`pregunta`, así que nunca podía devolver `insult`,
 * `nsfw`, `spam` ni `nonsense`, que es contra lo que comparan los cinco
 * consumidores. Pero devolvía un objeto válido, así que el `if (r)` de
 * `isToxic`/`isNSFW`/`isContentSpam` daba verdadero, esas funciones
 * devolvían `false` y la regex local NUNCA se llegaba a evaluar.
 *
 * En la práctica: los 22 insultos y los 8 términos NSFW que la lista de Rust
 * no tenía quedaban sin moderar, aunque el respaldo local sí los cubría. Los
 * términos se unificaron en `nlp.rs` y el paso por Python se fue.
 *
 * `intents` e `is_question` también se fueron del tipo: no los leía nadie.
 */
export async function analyzeIntent(text: string): Promise<NLPIntent | null> {
  try {
    const res = await rustClient.post<RustNlpResult>('/nlp/fast', { text })
    if (res.data?.ok && res.data.intent !== 'unknown') {
      return { text, primary: res.data.intent }
    }
  } catch {
    // Rust caído o timeout — el llamador cae a su regex local
  }
  return null
}

// ─── AI conversaciones y perfiles de estilo (Rust) ────────────────────────────

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

// ─── Perfiles de estilo ───────────────────────────────────────────────────────
// Antes los calculaba ai/trainer.py sobre Parquet + DuckDB, con su propia copia
// de cada mensaje. Ahora salen de la tabla `conversations` que Rust ya llenaba:
// un solo almacén, las mismas cifras, y Python se queda sin capa de datos.

export interface UserStyleProfile {
  jid:          string
  msg_count:    number
  avg_len:      number
  emoji_freq:   number
  common_words: string[]
  active_hours: number[]
  vocab_sample: string[]
  uses_slang:   boolean
}

export interface GroupStyleProfile {
  group_jid:    string
  msg_count:    number
  active_users: string[]
  common_words: string[]
  avg_msg_len:  number
  emoji_freq:   number
  vocab_sample: string[]
}

/** Un mensaje suelto de grupo: alimenta el perfil, no es un intercambio con la IA. */
export async function observeMessage(sender: string, gjid: string, text: string): Promise<void> {
  try {
    await rustClient.post('/ai/observe', { sender, gjid, text })
  } catch {
    // fire-and-forget — ignorar errores
  }
}

export async function getUserStyle(jid: string, days = 45): Promise<UserStyleProfile | null> {
  try {
    const res = await rustClient.get<UserStyleProfile>(
      `/ai/profile/${encodeURIComponent(jid)}`, { params: { days: String(days) } },
    )
    return res.data?.jid ? res.data : null
  } catch {
    return null
  }
}

export async function getGroupStyle(gjid: string, days = 30): Promise<GroupStyleProfile | null> {
  try {
    const res = await rustClient.get<GroupStyleProfile>(
      `/ai/group-style/${encodeURIComponent(gjid)}`, { params: { days: String(days) } },
    )
    return res.data?.group_jid ? res.data : null
  } catch {
    return null
  }
}

export async function deleteUserStyle(jid: string): Promise<number> {
  try {
    const res = await rustClient.delete<{ deleted_rows: number }>(
      `/ai/profile/${encodeURIComponent(jid)}`,
    )
    return res.data?.deleted_rows ?? 0
  } catch {
    return 0
  }
}

export interface CorpusStats {
  rows: number; senders: number; groups: number; disk_mb: number
}

export async function getCorpusStats(): Promise<CorpusStats | null> {
  try {
    const res = await rustClient.get<CorpusStats & { ok: boolean }>('/ai/corpus/stats')
    return res.data?.ok ? res.data : null
  } catch {
    return null
  }
}

// ─── Imágenes (Rust) ──────────────────────────────────────────────────────────
// Portados de Python en la 8.11.0. El mosaico LEGO estaba en ml/imagefx.py
// (Pillow + numpy) y la búsqueda en ml/search.py (requests + ddgs + Pillow):
// con los dos se van `pillow`, `requests` y `ddgs` del lado Python.
//
// El timeout va alto a propósito en los dos casos, igual que antes: el mosaico
// es trabajo de CPU sobre cientos de miles de píxeles, y la búsqueda son una
// petición a Bing más hasta cinco intentos de descarga.

export interface LegoResult {
  success:     boolean
  image?:      string      // PNG en base64
  error?:      string
  brick_size?: number
  original?:   { w: number; h: number }
  bricks?:     { w: number; h: number }
}

export async function legofyImage(imageB64: string, brickSize: number): Promise<LegoResult | null> {
  if (!rustCircuit.canAttempt()) return null
  try {
    const res = await rustClient.post<LegoResult>(
      '/imagefx/lego',
      { image: imageB64, brick_size: brickSize },
      { timeout: 20_000 },
    )
    rustCircuit.recordSuccess()
    return res.data
  } catch (err: any) {
    // Igual que en pythonPost: un 4xx es una petición mal armada, no un
    // servicio caído, y contarlo abriría el circuito por un bug propio.
    if (typeof err?.response?.status !== 'number' || err.response.status >= 500) {
      rustCircuit.recordFailure()
    }
    logger.debug({ err: err?.message }, 'legofyImage falló')
    return null
  }
}

export interface SearchedImage {
  success: boolean
  image?:  string      // JPEG en base64
  error?:  string
  width?:  number
  height?: number
  query?:  string
  total?:  number
}

export async function searchImage(query: string): Promise<SearchedImage | null> {
  if (!rustCircuit.canAttempt()) return null
  try {
    const res = await rustClient.post<SearchedImage>(
      '/search/image', { query }, { timeout: 30_000 },
    )
    rustCircuit.recordSuccess()
    return res.data
  } catch (err: any) {
    if (typeof err?.response?.status !== 'number' || err.response.status >= 500) {
      rustCircuit.recordFailure()
    }
    logger.debug({ err: err?.message }, 'searchImage falló')
    return null
  }
}

// ─── IA y personalidad (Rust) ─────────────────────────────────────────────────
// Portados de Python en la 8.11.0. `personality.py` (1141 líneas, de las que 849
// eran tabla de frases), `humor_engine.py`, `user_memory.py`, `commands_ref.py`,
// `ollama_client.py` y los dos endpoints de `hepein.py` viven ahora en
// `personality.rs`, `user_memory.rs` y `ai_chat.rs`.
//
// `/ai/chat/respond` hace el camino completo del lado de Rust: busca los
// perfiles de estilo en la misma base, arma el prompt, prueba Ollama y las APIs
// cloud, y si ninguna responde cae al motor local de plantillas. Antes eso eran
// dos viajes desde acá —uno a `/hepein/respond` y otro a
// `/ai/personality/respond`— con los perfiles yendo y viniendo en el cuerpo.

export interface ChatResult {
  text:        string
  mode:        string
  /** 'ia' si contestó un modelo, 'plantilla' si fue el motor local. */
  source:      'ia' | 'plantilla'
  hasProfile:  boolean
  groupMsgs:   number
}

export async function aiRespond(opts: {
  prompt:     string
  groupJid:   string
  senderJid:  string
  intent?:    string
  mode?:      string
  model?:     string
  useGpt?:    boolean
  useHumor?:  boolean
  history?:   Array<{ reply: string }>
  timeoutMs?: number
}): Promise<ChatResult | null> {
  if (!rustCircuit.canAttempt()) return null
  try {
    const res = await rustClient.post<{ success: boolean; data?: {
      text: string; mode: string; source: 'ia' | 'plantilla'
      has_profile: boolean; group_msgs: number
    } }>('/ai/chat/respond', {
      prompt:     opts.prompt,
      group_jid:  opts.groupJid,
      sender_jid: opts.senderJid,
      intent:     opts.intent   ?? 'neutral',
      use_gpt:    opts.useGpt   ?? true,
      use_humor:  opts.useHumor ?? true,
      history:    opts.history  ?? [],
      ...(opts.mode  ? { mode:  opts.mode }  : {}),
      ...(opts.model ? { model: opts.model } : {}),
      // Ollama en CPU tarda ~19 s medidos para una respuesta corta, y más con
      // el prompt cargado de vocabulario del grupo. Rust corta a OLLAMA_TIMEOUT
      // (40 s por defecto) y cae a plantilla, así que acá hay que darle margen
      // por encima de eso o se corta una respuesta que iba a llegar.
    }, { timeout: opts.timeoutMs ?? 45_000 })
    rustCircuit.recordSuccess()
    const d = res.data?.data
    if (!d?.text) return null
    return {
      text:       d.text,
      mode:       d.mode,
      source:     d.source,
      hasProfile: d.has_profile,
      groupMsgs:  d.group_msgs,
    }
  } catch (err: any) {
    if (typeof err?.response?.status !== 'number' || err.response.status >= 500) {
      rustCircuit.recordFailure()
    }
    logger.debug({ err: err?.message }, 'aiRespond falló')
    return null
  }
}

export async function aiImitate(prompt: string, targetJid: string): Promise<{
  text: string; hasProfile: boolean; msgCount: number
} | null> {
  if (!rustCircuit.canAttempt()) return null
  try {
    const res = await rustClient.post<{ success: boolean; data?: {
      text: string; has_profile: boolean; msg_count: number
    } }>('/ai/chat/imitate', { prompt, target_jid: targetJid }, { timeout: 45_000 })
    rustCircuit.recordSuccess()
    const d = res.data?.data
    if (!d?.text) return null
    return { text: d.text, hasProfile: d.has_profile, msgCount: d.msg_count }
  } catch (err: any) {
    if (typeof err?.response?.status !== 'number' || err.response.status >= 500) {
      rustCircuit.recordFailure()
    }
    logger.debug({ err: err?.message }, 'aiImitate falló')
    return null
  }
}

/** Registra el mensaje en la reputación del usuario. Fire-and-forget. */
export async function updateUserMemory(
  jid: string, text: string, intent: string, isCmd = false,
): Promise<void> {
  try {
    await rustClient.post(
      `/ai/memory/${encodeURIComponent(jid)}/update`,
      { text, intent, is_cmd: isCmd },
    )
  } catch {
    // fire-and-forget — ignorar errores
  }
}

export interface ModosPersonalidad {
  current:     string
  modes:       string[]
  group_modes: Record<string, string>
}

export async function getPersonalityModes(): Promise<ModosPersonalidad | null> {
  try {
    const res = await rustClient.get<{ success: boolean; data?: ModosPersonalidad }>(
      '/ai/personality/mode',
    )
    return res.data?.data ?? null
  } catch {
    return null
  }
}

export async function setPersonalityMode(mode: string, jid = ''): Promise<boolean> {
  try {
    const res = await rustClient.post<{ success: boolean }>(
      '/ai/personality/mode', { mode, jid },
    )
    return res.data?.success ?? false
  } catch {
    return false
  }
}

export async function resetPersonalityMode(jid = ''): Promise<boolean> {
  try {
    const res = await rustClient.post<{ success: boolean }>(
      '/ai/personality/reset', { jid },
    )
    return res.data?.success ?? false
  } catch {
    return false
  }
}
