// Hecho por HepeinBaileys

import axios, { type AxiosInstance } from 'axios'
import { config } from '@config'
import { logger } from '@core/logger.js'
import { rustCircuit } from '@lib/circuitBreaker.js'

// ─── Cliente de Rust ──────────────────────────────────────────────────────────
//
// Acá vivía además el cliente HTTP de la API de Python —`pythonPost`,
// `pythonGet`, `pythonDelete`, su circuito y sus reintentos—. No queda nada que
// llamar: lo último fueron los tres comandos de imagen, que están en
// `rust/src/vision.rs` desde la 8.11.0, y con ellos se fue la API entera, que
// se había quedado sirviendo un solo endpoint de salud que únicamente
// consultaban sus propios vigilantes.
//
// El archivo conserva el nombre para no tocar sus once puntos de importación.

const rustClient: AxiosInstance = axios.create({
  baseURL: config.rustApiUrl,
  headers: { 'Content-Type': 'application/json', 'x-api-key': config.sessionApiKey },
  // Sin timeout global: la mayoría de estas llamadas están en el camino
  // crítico de cada mensaje y responden en sub-milisegundos, pero unas pocas
  // (la IA con Ollama, los modelos de imagen) tardan segundos y fijan el suyo
  // en cada llamada. Un techo global tendría que ser el del caso más lento, lo
  // que no protegería a los rápidos de nada.
})

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
 * Antes, con `unknown` se consultaba a Python — y ese respaldo era PEOR que no
 * tener ninguno. El vocabulario de Python era `saludo`/`despedida`/`ayuda`/
 * `gracias`/`insulto`/`pregunta`, así que nunca podía devolver `insult`,
 * `nsfw`, `spam` ni `nonsense`, que es contra lo que comparan los cinco
 * consumidores. Pero devolvía un objeto válido, así que el `if (r)` de
 * `isToxic`/`isNSFW`/`isContentSpam` daba verdadero, esas funciones devolvían
 * `false` y la regex local NUNCA se llegaba a evaluar.
 *
 * En la práctica: los 22 insultos y los 8 términos NSFW que la lista de Rust no
 * tenía quedaban sin moderar, aunque el respaldo local sí los cubría. Los
 * términos se unificaron en `nlp.rs` y el paso por Python se fue.
 */
export async function analyzeIntent(text: string): Promise<NLPIntent | null> {
  try {
    const res = await rustClient.post<RustNlpResult>('/nlp/fast', { text }, { timeout: 300 })
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

// ─── Modelos de imagen (Rust) ─────────────────────────────────────────────────
// Portados de Python en la 8.11.0. Eran los últimos comandos que ataban el
// proyecto a un intérprete, y al mirarlos de cerca resultó que **dos de los tres
// ni siquiera usaban torch**: `dghs-imgutils` ya corría sus modelos con ONNX
// Runtime. Ahora los tres están en `vision.rs`:
//
//   #toanime   AnimeGANv2 en ONNX — 8 MB de modelo, en vez de 3,7 GB de torch
//   #removebg  isnetis en ONNX — 168 MB de modelo
//   #upscale   Anime4K, que no es una red sino un algoritmo: ningún modelo
//
// Los dos primeros bajan su modelo la primera vez que se usan y lo cachean en
// disco, así que el primer pedido puede tardar bastante más que los siguientes.

export interface ResultadoImagen {
  success:   boolean
  image?:    string
  error?:    string
  format?:   string
  scale?:    number
  original?: { w: number; h: number }
  result?:   { w: number; h: number }
}

async function visionPost(
  ruta: string,
  body: Record<string, unknown>,
): Promise<ResultadoImagen | null> {
  if (!rustCircuit.canAttempt()) return null
  try {
    // Timeout generoso: la primera llamada puede incluir la descarga del
    // modelo (168 MB en el caso de removebg) además de la inferencia.
    const res = await rustClient.post<ResultadoImagen>(ruta, body, { timeout: 180_000 })
    rustCircuit.recordSuccess()
    return res.data
  } catch (err: any) {
    if (typeof err?.response?.status !== 'number' || err.response.status >= 500) {
      rustCircuit.recordFailure()
    }
    logger.debug({ err: err?.message, ruta }, 'vision falló')
    return null
  }
}

export const vision = {
  removeBackground: (imageB64: string, bg?: string) =>
    visionPost('/vision/removebg', { image: imageB64, ...(bg ? { bg } : {}) }),

  toAnime: (imageB64: string) =>
    visionPost('/vision/toanime', { image: imageB64 }),

  upscale: (imageB64: string, scale = 2) =>
    visionPost('/vision/upscale', { image: imageB64, scale }),
}
