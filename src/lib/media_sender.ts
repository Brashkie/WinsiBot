import { readFile, access, readdir } from 'fs/promises'
import { join } from 'path'
import { generateMessageID, type WASocket, type WAMessage } from '@whiskeysockets/baileys'
import { rateLimiter } from './rateLimiter.js'
import { sessionClient } from './session.js'
import { logger } from '@core/logger.js'

const MEDIA_DIR   = join(process.cwd(), 'media')
const MAX_RETRIES = 3
const RETRY_DELAY = 1500

// Carpeta de medios propia de un sub-bot (imágenes/videos que #serbot setmedia
// guardó para ESE número) — si existe y tiene el archivo pedido, gana sobre
// MEDIA_DIR compartido. Se deriva del propio número conectado del socket, sin
// necesidad de importar el registro de sub-bots (evitaría un ciclo con
// serbot.ts, que ya importa de este archivo).
function subMediaDirFor(sock?: WASocket): string | null {
  const id = sock?.user?.id
  if (!id) return null
  const phone = id.split('@')[0]?.split(':')[0]?.replace(/[^0-9]/g, '')
  if (!phone) return null
  return join(process.cwd(), 'data', 'subbots', phone, 'media')
}

const RETRYABLE = [
  'Connection Closed', 'Connection Lost', 'ETIMEDOUT',
  'Stream Errored', 'ECONNRESET', 'socket hang up',
  'send timeout', // rateLimiter.ts — sock.sendMessage() colgado, ver comentario ahí
]

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms))

// ─── safeSend — respuestas directas a comandos (sin cola) ────────────────────
// Para broadcasts o envíos masivos, usar broadcastSend en su lugar (que a su
// vez usa enqueueSend por debajo — privada, sin caso de uso directo hoy).
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
async function enqueueSend(
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

// ─── sendCritical — envío con outbox, para lo que no puede perderse ─────────
//
// El problema que resuelve: el bot descuenta dinero, modifica el inventario o
// registra una transferencia, y muere antes de mandar la confirmación. Queda
// el estado cambiado y el usuario sin respuesta, sin forma de saber qué pasó.
//
//   encolar (persistente)  →  enviar  →  marcar enviado
//
// Si el proceso muere en cualquier punto, al arrancar `replayOutbox()` reenvía
// lo que quedó encolado. El id se genera acá con generateMessageID() de Baileys
// y se le pasa al envío, así que el mismo identificador vale para el outbox y
// para el seguimiento de entrega — no hay dos espacios de ids.
//
// Sobre la ventana residual, para no prometer de más: el texto de estos
// mensajes casi siempre depende del resultado del cambio ("ahora tenés ¥X"),
// así que en la práctica se llama DESPUÉS de aplicarlo, no antes. Queda una
// ventana entre el cambio y el encolado — pero son dos llamadas síncronas en
// memoria (microsegundos), contra la ventana que había antes, que era toda la
// latencia de red del envío (cientos de ms, o segundos con WhatsApp lento).
// El riesgo no desaparece: se reduce en varios órdenes de magnitud.
//
// No usar para todo: guardar el contenido de cada mensaje saliente haría
// crecer la base sin motivo. Es para economía, compras, transferencias,
// regalos, apuestas y acciones administrativas.
//
// Solo texto (con menciones): el payload tiene que poder reconstruirse desde
// JSON, así que medios y botones quedan fuera a propósito.
export interface CriticalContent {
  text:      string
  mentions?: string[]
}

export async function sendCritical(
  sock:    WASocket,
  jid:     string,
  content: CriticalContent,
  opts:    { quoted?: WAMessage } = {},
): Promise<any> {
  const id = generateMessageID()

  // Si Rust no responde, se sigue adelante sin garantía en vez de bloquear al
  // usuario: un comando que no contesta es peor que uno sin red de seguridad.
  let queued = false
  try {
    await sessionClient.enqueueOutbox([{ id, jid, payload: JSON.stringify(content) }])
    queued = true
  } catch (err) {
    logger.warn({ err, jid }, 'sendCritical: no se pudo encolar — se envía sin garantía')
  }

  try {
    const res = await safeSend(() =>
      sock.sendMessage(jid, content, { messageId: id, ...(opts.quoted && { quoted: opts.quoted }) }),
    )
    if (queued) await sessionClient.markOutboxSent([id]).catch(() => {})
    return res
  } catch (err) {
    // Queda en el outbox con estado "encolado": replayOutbox() lo reintentará
    // en el próximo arranque. No se marca como enviado a propósito.
    logger.warn({ err, jid, id }, 'sendCritical: envío falló — queda en el outbox')
    throw err
  }
}

// ─── replayOutbox — reenvía al arrancar lo que quedó a medias ───────────────
export async function replayOutbox(sock: WASocket): Promise<{ resent: number; failed: number }> {
  let pending: Awaited<ReturnType<typeof sessionClient.outboxUnsent>>
  try {
    pending = await sessionClient.outboxUnsent()
  } catch {
    return { resent: 0, failed: 0 }   // Rust caído — no es un error del bot
  }
  // Solo lo que lleva un rato encolado. replayOutbox() corre en cada 'ready',
  // y 'ready' se dispara también en cada reconexión: sin este filtro, un
  // sendCritical() en vuelo —ya encolado, todavía sin marcar como enviado— se
  // reenviaría por duplicado si justo en ese instante hay una reconexión. Un
  // envío normal se marca en milisegundos, así que 60s no deja pasar nada real.
  const MIN_AGE_SECS = 60
  const nowSecs = Math.floor(Date.now() / 1000)
  const stale = pending.filter(m => nowSecs - m.queued_at >= MIN_AGE_SECS)
  if (!stale.length) return { resent: 0, failed: 0 }

  logger.info(`Outbox: ${stale.length} mensajes quedaron sin enviar — reintentando`)

  let resent = 0, failed = 0
  for (const m of stale) {
    // El reintento se cuenta ANTES de intentar: si el envío cuelga o el proceso
    // muere acá, en el próximo arranque el contador ya subió y el mensaje
    // acabará cayendo del listado en vez de reintentarse para siempre.
    await sessionClient.bumpOutboxRetry([m.id]).catch(() => {})
    try {
      const content = JSON.parse(m.payload)
      await safeSend(() => sock.sendMessage(m.jid, content, { messageId: m.id }))
      await sessionClient.markOutboxSent([m.id]).catch(() => {})
      resent++
    } catch (err) {
      logger.warn({ err, id: m.id, jid: m.jid, retry: m.retry_count }, 'Outbox: reenvío falló')
      failed++
    }
  }

  logger.info(`Outbox: ${resent} reenviados, ${failed} fallidos`)
  return { resent, failed }
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

export async function findMedia(name: string, sock?: WASocket): Promise<MediaResult> {
  const exts: Array<[string, Exclude<MediaType, null>]> = [
    [`${name}.mp4`,  'video'],
    [`${name}.gif`,  'gif'],
    [`${name}.jpg`,  'image'],
    [`${name}.jpeg`, 'image'],
    [`${name}.png`,  'image'],
    [`${name}.webp`, 'image'],
  ]

  const overrideDir = subMediaDirFor(sock)
  for (const dir of overrideDir ? [overrideDir, MEDIA_DIR] : [MEDIA_DIR]) {
    for (const [file, type] of exts) {
      try {
        const path = join(dir, file)
        await access(path)
        return { type, buffer: await readFile(path) }
      } catch {}
    }
  }
  return { type: null, buffer: null }
}

async function findMediaRandomIn(dir: string, name: string): Promise<MediaResult | null> {
  try {
    const files   = await readdir(dir)
    const pattern = new RegExp(`^${name}\\d*$`)
    const validExts = ['mp4', 'gif', 'jpg', 'jpeg', 'png', 'webp']

    const matches = files.filter(f => {
      const ext  = f.split('.').pop()?.toLowerCase() ?? ''
      const base = f.slice(0, f.lastIndexOf('.'))
      return validExts.includes(ext) && pattern.test(base)
    })

    if (!matches.length) return null

    const chosen = matches[Math.floor(Math.random() * matches.length)]!
    const ext    = chosen.split('.').pop()?.toLowerCase() ?? ''
    const type: Exclude<MediaType, null> | null =
      ext === 'mp4'                              ? 'video'
      : ext === 'gif'                            ? 'gif'
      : ['jpg','jpeg','png','webp'].includes(ext) ? 'image'
      : null

    if (!type) return { type: null, buffer: null }
    return { type, buffer: await readFile(join(dir, chosen)) }
  } catch {
    return null
  }
}

export async function findMediaRandom(name: string, sock?: WASocket): Promise<MediaResult> {
  const overrideDir = subMediaDirFor(sock)
  if (overrideDir) {
    const fromOverride = await findMediaRandomIn(overrideDir, name)
    if (fromOverride) return fromOverride
  }
  const fromShared = await findMediaRandomIn(MEDIA_DIR, name)
  return fromShared ?? findMedia(name, sock)
}

// ─── sendWithMedia ────────────────────────────────────────────────────────────
export async function sendWithMedia(
  sock:       WASocket,
  jid:        string,
  text:       string,
  name:       string,
  quoted?:    WAMessage,
  random = false,
  mentions?:  string[],
): Promise<void> {
  const opts    = quoted ? { quoted } : {}
  const mention = mentions ? { mentions } : {}
  const media   = random ? await findMediaRandom(name, sock) : await findMedia(name, sock)

  if (media.type === 'video' && media.buffer) {
    return safeSend(() => sock.sendMessage(jid, { video: media.buffer!, caption: text, gifPlayback: false, ...mention }, opts))
  }
  if (media.type === 'gif' && media.buffer) {
    return safeSend(() => sock.sendMessage(jid, { video: media.buffer!, caption: text, gifPlayback: true, ...mention }, opts))
  }
  if (media.type === 'image' && media.buffer) {
    return safeSend(() => sock.sendMessage(jid, { image: media.buffer!, caption: text, ...mention }, opts))
  }
  return safeSend(() => sock.sendMessage(jid, { text, ...mention }, opts))
}
