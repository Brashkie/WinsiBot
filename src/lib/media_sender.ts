import { readFile, access, readdir } from 'fs/promises'
import { join } from 'path'
import type { WASocket, WAMessage } from '@whiskeysockets/baileys'
import { rateLimiter } from './rateLimiter.js'
import { sessionClient } from './session.js'

const MEDIA_DIR   = join(process.cwd(), 'media')
const MAX_RETRIES = 3
const RETRY_DELAY = 1500

const RETRYABLE = [
  'Connection Closed', 'Connection Lost', 'ETIMEDOUT',
  'Stream Errored', 'ECONNRESET', 'socket hang up',
]

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms))

// ─── safeSend — respuestas directas a comandos (sin cola) ────────────────────
// Para broadcasts o envíos masivos, usar broadcastSend o enqueueSend en su lugar.
export async function safeSend(fn: () => Promise<any>): Promise<any> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      // Solo el bucket global (sin cola ni límite por-JID) — protege el techo
      // de envíos salientes sin agregar latencia perceptible a una respuesta.
      return await rateLimiter.direct(fn)
    } catch (err: any) {
      const msg = String(err?.message ?? err ?? '')
      if (!RETRYABLE.some(e => msg.includes(e)) || attempt === MAX_RETRIES - 1) throw err
      await sleep(RETRY_DELAY * (attempt + 1))
    }
  }
}

// ─── enqueueSend — envío con rate limiting + delivery tracking ───────────────
// Usar cuando el destino es variable (loops, webhooks, subbots, notificaciones).
// Auto-registra el mensaje en Rust para seguimiento de entrega.
export async function enqueueSend(
  jid:      string,
  fn:       () => Promise<any>,
  priority: 'urgent' | 'normal' | 'broadcast' = 'normal',
): Promise<any> {
  return rateLimiter.enqueue(jid, async () => {
    let result: any
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        result = await fn()
        break
      } catch (err: any) {
        const msg = String(err?.message ?? err ?? '')
        if (!RETRYABLE.some(e => msg.includes(e)) || attempt === MAX_RETRIES - 1) throw err
        await sleep(RETRY_DELAY * (attempt + 1))
      }
    }
    // Registrar en Rust para tracking de delivery (fire-and-forget)
    const msgId = result?.key?.id
    if (msgId) {
      sessionClient.trackMessages([{
        id:  msgId,
        jid,
        ts:  Date.now(),
      }]).catch(() => {})
    }
    return result
  }, priority)
}

// ─── broadcastSend — envío masivo a múltiples JIDs ───────────────────────────
// Respeta WhatsApp rate limits: encola cada mensaje, prioridad 'broadcast'.
// Devuelve estadísticas de envíos exitosos/fallidos.
export async function broadcastSend(
  sock:    WASocket,
  jids:    string[],
  payload: Parameters<WASocket['sendMessage']>[1],
  opts?: { onProgress?: (sent: number, total: number) => void },
): Promise<{ sent: number; failed: number; errors: Array<{ jid: string; error: string }> }> {
  let sent   = 0
  let failed = 0
  const errors: Array<{ jid: string; error: string }> = []

  await Promise.allSettled(
    jids.map(jid =>
      enqueueSend(jid, () => sock.sendMessage(jid, payload), 'broadcast')
        .then(() => {
          sent++
          opts?.onProgress?.(sent + failed, jids.length)
        })
        .catch((err: any) => {
          failed++
          errors.push({ jid, error: String(err?.message ?? err) })
          opts?.onProgress?.(sent + failed, jids.length)
        }),
    ),
  )

  return { sent, failed, errors }
}

// ─── Media finder ─────────────────────────────────────────────────────────────
type MediaType = 'video' | 'image' | 'gif' | null
interface MediaResult { type: MediaType; buffer: Buffer | null }

export async function findMedia(name: string): Promise<MediaResult> {
  const exts: Array<[string, Exclude<MediaType, null>]> = [
    [`${name}.mp4`,  'video'],
    [`${name}.gif`,  'gif'],
    [`${name}.jpg`,  'image'],
    [`${name}.jpeg`, 'image'],
    [`${name}.png`,  'image'],
    [`${name}.webp`, 'image'],
  ]
  for (const [file, type] of exts) {
    try {
      const path = join(MEDIA_DIR, file)
      await access(path)
      return { type, buffer: await readFile(path) }
    } catch {}
  }
  return { type: null, buffer: null }
}

export async function findMediaRandom(name: string): Promise<MediaResult> {
  try {
    const files   = await readdir(MEDIA_DIR)
    const pattern = new RegExp(`^${name}\\d*$`)
    const validExts = ['mp4', 'gif', 'jpg', 'jpeg', 'png', 'webp']

    const matches = files.filter(f => {
      const ext  = f.split('.').pop()?.toLowerCase() ?? ''
      const base = f.slice(0, f.lastIndexOf('.'))
      return validExts.includes(ext) && pattern.test(base)
    })

    if (!matches.length) return findMedia(name)

    const chosen = matches[Math.floor(Math.random() * matches.length)]!
    const ext    = chosen.split('.').pop()?.toLowerCase() ?? ''
    const type: Exclude<MediaType, null> | null =
      ext === 'mp4'                              ? 'video'
      : ext === 'gif'                            ? 'gif'
      : ['jpg','jpeg','png','webp'].includes(ext) ? 'image'
      : null

    if (!type) return { type: null, buffer: null }
    return { type, buffer: await readFile(join(MEDIA_DIR, chosen)) }
  } catch {
    return findMedia(name)
  }
}

// ─── sendWithMedia ────────────────────────────────────────────────────────────
export async function sendWithMedia(
  sock:    WASocket,
  jid:     string,
  text:    string,
  name:    string,
  quoted?: WAMessage,
  random = false,
): Promise<void> {
  const opts  = quoted ? { quoted } : {}
  const media = random ? await findMediaRandom(name) : await findMedia(name)

  if (media.type === 'video' && media.buffer) {
    return safeSend(() => sock.sendMessage(jid, { video: media.buffer!, caption: text, gifPlayback: false }, opts))
  }
  if (media.type === 'gif' && media.buffer) {
    return safeSend(() => sock.sendMessage(jid, { video: media.buffer!, caption: text, gifPlayback: true }, opts))
  }
  if (media.type === 'image' && media.buffer) {
    return safeSend(() => sock.sendMessage(jid, { image: media.buffer!, caption: text }, opts))
  }
  return safeSend(() => sock.sendMessage(jid, { text }, opts))
}
