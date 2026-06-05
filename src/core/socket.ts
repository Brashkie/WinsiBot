import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  makeCacheableSignalKeyStore,
  fetchLatestBaileysVersion,
  type WASocket,
} from '@whiskeysockets/baileys'
import { Boom } from '@hapi/boom'
import EventEmitter3 from 'eventemitter3'
import pino from 'pino'
import { color, themes } from 'ansimax'
import { config } from '@config'
import { logger } from './logger.js'
import { winsiStore } from '@core/store.js'

function fmtJid(jid: string): string {
  return jid.replace('@s.whatsapp.net', '').replace('@g.us', '').replace('@lid', '')
}

interface WinsiEvents {
  ready:   [sock: WASocket]
  message: [msg: import('@whiskeysockets/baileys').WAMessage, sock: WASocket]
  closed:  []
}

const SILENT_CODES   = new Set([428, 408])
const NO_RETRY_CODES = new Set([
  DisconnectReason.loggedOut,
  440,
  401,
])

// Bad MAC flood detection — umbral para auto-clear de sesiones Signal
const BAD_MAC_THRESHOLD = 8   // Bad MACs en ventana de 60s → limpiar + reconectar
const BAD_MAC_WINDOW_MS = 60_000

export class WinsiSocket extends EventEmitter3<WinsiEvents> {
  private sock:              WASocket | null = null
  private retryCount:        number = 0
  private retryTimer:        ReturnType<typeof setTimeout> | null = null
  private isReconnecting     = false
  private readonly maxRetries = 50

  private badMacCount        = 0
  private badMacWindowStart  = 0
  private signalClearInProgress = false

  private cleanup() {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer)
      this.retryTimer = null
    }
    if (this.sock) {
      try {
        this.sock.ev.removeAllListeners('connection.update')
        this.sock.ev.removeAllListeners('messages.upsert')
        this.sock.ev.removeAllListeners('creds.update')
        this.sock.ev.removeAllListeners('contacts.update')
        this.sock.ev.removeAllListeners('chats.upsert')
        this.sock.ev.removeAllListeners('groups.update')
        this.sock.ev.removeAllListeners('group-participants.update')
      } catch (err) {
        logger.warn({ err }, 'Error al limpiar listeners')
      }
      this.sock = null
    }
  }

  private scheduleReconnect() {
    if (this.isReconnecting) return
    if (this.retryCount >= this.maxRetries) {
      logger.error('Maximo de reconexiones alcanzado')
      this.emit('closed')
      return
    }
    this.isReconnecting = true
    this.retryCount++
    const delay = Math.min(1000 * 2 ** this.retryCount, 60_000)
    logger.info(`Reconectando en ${delay}ms (intento ${this.retryCount}/${this.maxRetries})`)
    this.retryTimer = setTimeout(async () => {
      this.isReconnecting = false
      await this.connect()
    }, delay)
  }

  async connect(): Promise<void> {
    this.cleanup()

    await winsiStore.load()

    // ─── Rust session API — health check + auto-recover (opcional) ────────────
    const { sessionClient } = await import('@lib/session.js')
    await sessionClient.ensureHealthy()

    const { state, saveCreds } = await useMultiFileAuthState(config.sessionPath)
    const { version }          = await fetchLatestBaileysVersion()

    this.sock = makeWASocket({
      version,
      auth: {
        creds: state.creds,
        keys:  makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' }) as any),
      },
      logger:                         pino({ level: 'silent' }) as any,
      generateHighQualityLinkPreview: true,
      markOnlineOnConnect:            false,
      retryRequestDelayMs:            2000,
    })

    winsiStore.bind(this.sock)
    this.sock.ev.on('creds.update', () => {
      saveCreds()
      // backup async a Rust — no bloquea, falla silenciosamente si no está corriendo
      sessionClient.save(state.creds).catch(() => {})
    })

    // ─── Delivery status tracking ─────────────────────────────────────────────
    // Baileys MessageStatus: 0=error, 1=pending, 2=server_ack, 3=delivery_ack, 4=read, 5=played
    // Rust outbox status:    0=sent,  1=entregado,             2=leido,         3=reproducido
    const STATUS_MAP: Record<number, number> = { 2: 0, 3: 1, 4: 2, 5: 3 }

    // Buffer de acks para enviar en lote cada 3s (evita una llamada HTTP por cada ack)
    let _ackBuffer: Array<{ id: string; status: number }> = []
    let _ackTimer:  ReturnType<typeof setTimeout> | null  = null

    const flushAcks = () => {
      if (!_ackBuffer.length) return
      const batch = _ackBuffer.splice(0)
      _ackTimer   = null
      sessionClient.ackMessages(batch).catch(() => {})
    }

    const bufferAck = (id: string, rustStatus: number) => {
      _ackBuffer.push({ id, status: rustStatus })
      if (!_ackTimer) _ackTimer = setTimeout(flushAcks, 3_000)
    }

    // Actualiza status cuando WhatsApp confirma entrega/lectura
    this.sock.ev.on('messages.update', (updates) => {
      for (const upd of updates) {
        const msgId     = upd.key?.id
        const baileysSt = (upd.update as any)?.status as number | undefined
        if (!msgId || baileysSt === undefined) continue
        const rustSt = STATUS_MAP[baileysSt]
        if (rustSt !== undefined) bufferAck(msgId, rustSt)
      }
    })

    // Actualiza cuando un contacto lee / reproduce el mensaje
    this.sock.ev.on('message-receipt.update', (receipts) => {
      for (const receipt of receipts) {
        const msgId = receipt.key?.id
        if (!msgId) continue
        const r = receipt.receipt as any
        if (r?.readTimestamp)     bufferAck(msgId, 2)
        else if (r?.playedTimestamp) bufferAck(msgId, 3)
        else if (r?.receiptTimestamp) bufferAck(msgId, 1)
      }
    })

    this.sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
      if (qr) {
        const qrcode = await import('qrcode-terminal')
        qrcode.default.generate(qr, { small: true })
        logger.info('Escanea el QR para conectar')
      }

      if (connection === 'close') {
        const code = (lastDisconnect?.error as Boom)?.output?.statusCode

        if (code && SILENT_CODES.has(code)) return

        if (code && NO_RETRY_CODES.has(code)) {
          if (code === 440) {
            logger.warn('Sesion expulsada por otra instancia (440) — cierra WhatsApp Web')
          } else if (code === DisconnectReason.loggedOut) {
            logger.warn('Sesion cerrada (loggedOut) — borra /auth y reconecta')
          }
          this.cleanup()
          this.emit('closed')
          return
        }

        logger.warn({ code }, 'Conexion cerrada — reintentando')
        this.scheduleReconnect()
      }

      if (connection === 'open') {
        this.retryCount     = 0
        this.isReconnecting = false
        logger.info('WinsiBot conectado')
        this.emit('ready', this.sock!)

        // precargar grupos
        try {
          const groups = await this.sock!.groupFetchAllParticipating()
          const keys   = Object.keys(groups)
          for (const groupJid of keys) {
            winsiStore.preloadFromData(groupJid, groups[groupJid])
          }
          logger.info(`${keys.length} grupos precargados`)
        } catch (err) {
          logger.warn({ err }, 'Error precargando grupos')
        }
      }
    })

    // ─── mensajes entrantes ───────────────────────────────────────────────────
    this.sock.ev.on('messages.upsert', ({ messages, type }) => {
      // 'notify' = mensaje nuevo normal
      // 'append' = Baileys entrega mensajes recientes post-sync — aceptar si son del último minuto
      if (type !== 'notify' && type !== 'append') return

      const msg = messages[0]
      if (!msg) return

      if (type === 'append') {
        const ts = Number(msg.messageTimestamp ?? 0) * 1000
        // descartar mensajes históricos (>5min) del sync inicial
        if (!ts || Date.now() - ts > 5 * 60_000) return
      }

      const jidShort  = fmtJid(msg.key.remoteJid ?? '')
      const isGroup   = msg.key.remoteJid?.endsWith('@g.us') ?? false
      const chatLabel = isGroup ? color.magenta('Grupo') : themes.warning('Privado')
      const meLabel   = msg.key.fromMe
        ? color.dim('fromMe')
        : color.cyan('entrante')

      if (!msg.message) {
        console.log(
          `  ${color.red('◈')} ${color.bold(color.red('Bad MAC'))}  ${chatLabel} ${color.dim(jidShort)}  ${meLabel}`
        )
        // ─── Bad MAC flood detection ───────────────────────────────────────
        const now = Date.now()
        if (now - this.badMacWindowStart > BAD_MAC_WINDOW_MS) {
          this.badMacCount       = 0
          this.badMacWindowStart = now
        }
        this.badMacCount++
        if (this.badMacCount >= BAD_MAC_THRESHOLD && !this.signalClearInProgress) {
          this.signalClearInProgress = true
          this.badMacCount           = 0
          logger.warn(`[socket] ${BAD_MAC_THRESHOLD} Bad MACs en ${BAD_MAC_WINDOW_MS / 1000}s — limpiando sesiones Signal y reconectando`)
          import('@lib/session.js').then(({ sessionClient }) =>
            sessionClient.clearSignalSessions()
          ).then(res => {
            logger.info(`[socket] ${res.deleted} archivos Signal eliminados — reconectando`)
            this.signalClearInProgress = false
            this.cleanup()
            this.scheduleReconnect()
          }).catch(err => {
            logger.warn({ err }, '[socket] clearSignalSessions falló — reconectando igual')
            this.signalClearInProgress = false
            this.cleanup()
            this.scheduleReconnect()
          })
        }
        return
      }

      console.log(
        `  ${color.blue('◈')} ${color.bold('Mensaje')}  ${chatLabel} ${color.dim(jidShort)}  ${meLabel}`
      )

      this.emit('message', msg, this.sock!)
    })
  }

  getSocket(): WASocket | null { return this.sock  }
}