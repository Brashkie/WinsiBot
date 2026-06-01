import http              from 'node:http'
import { createHmac, timingSafeEqual } from 'node:crypto'
import type { WASocket } from '@whiskeysockets/baileys'
import { logger }        from '@core/logger.js'
import { safeSend, broadcastSend } from '@lib/media_sender.js'

// ─── Config ───────────────────────────────────────────────────────────────────
const PORT           = Number(process.env.WEBHOOK_PORT   ?? 4001)
const SECRET         = process.env.WEBHOOK_SECRET        ?? 'winsibot_secret'
const MAX_BODY_BYTES = 64 * 1024     // 64 KB
const RATE_WINDOW_MS = 1_000        // 1 req/IP/s

// ─── Tipos de eventos ─────────────────────────────────────────────────────────
interface SendMessageEvent {
  event:  'send_message'
  jid:    string
  text:   string
}

interface BroadcastEvent {
  event: 'broadcast'
  jids:  string[]
  text:  string
}

interface RunJobEvent {
  event: 'run_job'
  jobId: string
}

interface PingEvent {
  event: 'ping'
}

type WebhookPayload = SendMessageEvent | BroadcastEvent | RunJobEvent | PingEvent

// ─── Estado del módulo ────────────────────────────────────────────────────────
let _sock:   WASocket | null  = null
let _server: http.Server | null = null

// ─── Rate limiter por IP ──────────────────────────────────────────────────────
const _rateLast = new Map<string, number>()

setInterval(() => {
  const cutoff = Date.now() - 60_000
  for (const [ip, t] of _rateLast) {
    if (t < cutoff) _rateLast.delete(ip)
  }
}, 60_000).unref()

function rateOk(ip: string): boolean {
  const now  = Date.now()
  const last = _rateLast.get(ip) ?? 0
  if (now - last < RATE_WINDOW_MS) return false
  _rateLast.set(ip, now)
  return true
}

// ─── Verificación de firma HMAC ───────────────────────────────────────────────
function verifySignature(body: string, header: string | undefined): boolean {
  if (!header) return true  // firma opcional — omitir si no se envía
  const sig      = header.startsWith('sha256=') ? header.slice(7) : header
  const expected = createHmac('sha256', SECRET).update(body).digest('hex')
  const sigBuf   = Buffer.from(sig,      'hex')
  const expBuf   = Buffer.from(expected, 'hex')
  try {
    return sigBuf.length === expBuf.length && timingSafeEqual(sigBuf, expBuf)
  } catch {
    return false
  }
}

// ─── Leer body con límite de tamaño ──────────────────────────────────────────
function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = ''
    req.setEncoding('utf8')
    req.on('data', (chunk: string) => {
      body += chunk
      if (body.length > MAX_BODY_BYTES) {
        req.destroy()
        reject(new Error('PAYLOAD_TOO_LARGE'))
      }
    })
    req.on('end',   () => resolve(body))
    req.on('error', reject)
  })
}

// ─── Handlers de eventos ──────────────────────────────────────────────────────
async function handleEvent(payload: WebhookPayload): Promise<{ ok: boolean; msg?: string }> {
  switch (payload.event) {

    case 'ping':
      return { ok: true, msg: 'pong' }

    case 'send_message': {
      if (!_sock) return { ok: false, msg: 'socket no disponible' }
      const jid  = payload.jid?.trim()
      const text = payload.text?.trim()
      if (!jid || !text) return { ok: false, msg: '"jid" y "text" requeridos' }
      await safeSend(() => _sock!.sendMessage(jid, { text }))
      logger.info({ jid }, '[webhook] send_message enviado')
      return { ok: true }
    }

    case 'broadcast': {
      if (!_sock) return { ok: false, msg: 'socket no disponible' }
      const text = payload.text?.trim()
      if (!text)  return { ok: false, msg: '"text" requerido' }
      const jids = (payload.jids ?? []).filter((j): j is string => typeof j === 'string' && !!j.trim())
      if (jids.length === 0) return { ok: false, msg: '"jids" vacío o inválido' }
      const { sent, failed } = await broadcastSend(_sock, jids, { text })
      logger.info({ total: jids.length, sent, failed }, '[webhook] broadcast completado')
      return { ok: true, msg: `enviado a ${sent}/${jids.length}` }
    }

    case 'run_job': {
      const jobId = payload.jobId?.trim()
      if (!jobId) return { ok: false, msg: '"jobId" requerido' }
      const { triggerJob } = await import('@plugins/scheduler/cron.js')
      const p = triggerJob(jobId)
      if (!p) return { ok: false, msg: `job "${jobId}" no encontrado` }
      await p
      logger.info({ jobId }, '[webhook] job ejecutado')
      return { ok: true }
    }
  }
}

// ─── Handler HTTP ─────────────────────────────────────────────────────────────
function json(res: http.ServerResponse, code: number, data: unknown): void {
  const body = JSON.stringify(data)
  res.writeHead(code, {
    'Content-Type':   'application/json',
    'Content-Length': Buffer.byteLength(body),
  })
  res.end(body)
}

async function requestHandler(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<void> {
  if (req.method === 'GET' && req.url === '/health') {
    json(res, 200, { ok: true, uptime: Math.floor(process.uptime()), connected: _sock !== null })
    return
  }

  if (req.method !== 'POST' || req.url !== '/webhook') {
    res.writeHead(404).end()
    return
  }

  const ip = (req.socket.remoteAddress ?? 'unknown').replace('::ffff:', '')

  if (!rateOk(ip)) {
    json(res, 429, { ok: false, error: 'rate limit excedido' })
    return
  }

  let body: string
  try {
    body = await readBody(req)
  } catch (err: any) {
    const code = err?.message === 'PAYLOAD_TOO_LARGE' ? 413 : 400
    json(res, code, { ok: false, error: err?.message ?? 'error leyendo body' })
    return
  }

  if (!verifySignature(body, req.headers['x-webhook-signature'] as string | undefined)) {
    logger.warn({ ip }, '[webhook] firma inválida rechazada')
    json(res, 401, { ok: false, error: 'firma inválida' })
    return
  }

  let payload: WebhookPayload
  try {
    payload = JSON.parse(body)
  } catch {
    json(res, 400, { ok: false, error: 'JSON inválido' })
    return
  }

  if (!payload?.event) {
    json(res, 400, { ok: false, error: 'campo "event" requerido' })
    return
  }

  try {
    const result = await handleEvent(payload)
    json(res, result.ok ? 200 : 422, result)
  } catch (err: any) {
    logger.error({ err, event: payload.event }, '[webhook] error interno')
    json(res, 500, { ok: false, error: 'error interno del servidor' })
  }
}

// ─── Lifecycle ────────────────────────────────────────────────────────────────
export function startWebhookReceiver(sock: WASocket): void {
  _sock = sock
  if (_server) return

  _server = http.createServer((req, res) => {
    requestHandler(req, res).catch(err => {
      logger.error({ err }, '[webhook] error no capturado')
      if (!res.headersSent) res.writeHead(500).end()
    })
  })

  _server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      logger.warn(`[webhook] puerto ${PORT} ya en uso — receiver no iniciado`)
    } else {
      logger.error({ err }, '[webhook] error del servidor')
    }
  })

  _server.listen(PORT, '127.0.0.1', () => {
    logger.info(`[webhook] receiver escuchando en :${PORT}`)
  })
}

export function stopWebhookReceiver(): void {
  _sock = null
  if (!_server) return
  _server.close(() => logger.info('[webhook] receiver detenido'))
  _server = null
}

export function updateSock(sock: WASocket): void {
  _sock = sock
}
