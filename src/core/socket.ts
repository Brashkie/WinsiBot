import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  makeCacheableSignalKeyStore,
  fetchLatestBaileysVersion,
  S_WHATSAPP_NET,
  type WASocket,
} from '@whiskeysockets/baileys'
import { Boom } from '@hapi/boom'
import EventEmitter3 from 'eventemitter3'
import pino from 'pino'
import { color, themes } from 'ansimax'
import { config } from '@config'
import { logger } from './logger.js'
import { winsiStore } from '@core/store.js'
import { verifyAndReport } from '@lib/authVerifier.js'

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

// Fallback local: por si Rust no está corriendo, rastreamos Bad MAC en proceso
// (Rust es la fuente de verdad cuando está disponible)
const LOCAL_BAD_MAC_THRESHOLD = 5
const LOCAL_BAD_MAC_WINDOW_MS = 30_000
const LOCAL_BAD_MAC_COOLDOWN  = 10_000  // evitar clear loop

export class WinsiSocket extends EventEmitter3<WinsiEvents> {
  constructor() {
    super()
    this._startMemoryTrim()
  }

  private sock:          WASocket | null = null
  private retryCount:    number = 0
  private retryTimer:    ReturnType<typeof setTimeout> | null = null
  private isReconnecting = false
  // Sin límite de reintentos — el bot no muere nunca por desconexión.
  // Solo 'loggedOut' (401) o kick de otra sesión (440) detienen el loop.

  // ─── Watchdog de conexión zombie ────────────────────────────────────────
  // Baileys detecta sockets muertos por su propio ping/pong, pero a veces
  // WhatsApp deja la conexión "abierta" a nivel de transporte sin entregar
  // mensajes nuevos a este dispositivo — ni 'close' ni error, solo silencio,
  // y puede pasar a los pocos minutos de conectar. Por eso el sondeo corre
  // en un intervalo fijo (no espera un período de silencio) y usa sock.query
  // (un IQ real que SÍ espera respuesta del servidor) — sendPresenceUpdate
  // no sirve para esto: solo escribe al socket local, nunca falla.
  private zombieCheckTimer: ReturnType<typeof setInterval> | null = null
  private readonly ZOMBIE_CHECK_INTERVAL_MS = 90_000
  private readonly ZOMBIE_PROBE_TIMEOUT_MS  = 10_000

  // Per-group Bad MAC tracking (fallback local cuando Rust no responde)
  private badMacByGroup = new Map<string, { count: number; windowStart: number; clearedAt: number }>()
  // Grupos que están en proceso de clear
  private clearingGroups = new Set<string>()

  private cleanup() {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer)
      this.retryTimer = null
    }
    if (this.zombieCheckTimer) {
      clearInterval(this.zombieCheckTimer)
      this.zombieCheckTimer = null
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
    this.isReconnecting = true
    this.retryCount++
    // Backoff exponencial: 2s → 4s → 8s → … máx 60s — sin límite de intentos.
    // + jitter (hasta 1s) para no reconectar exactamente al mismo tiempo que
    // otros sockets (subbots) tras un corte de red compartido.
    const delay = Math.min(1000 * 2 ** Math.min(this.retryCount, 6), 60_000)
      + Math.floor(Math.random() * 1000)
    logger.info(`Reconectando en ${Math.round(delay / 1000)}s (intento #${this.retryCount})`)
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

    // ─── Verificación criptográfica del auth dir ──────────────────────────────
    // Usa @brashkie/signalis-core para validar todos los pares Curve25519 antes
    // de pasárselos a Baileys. Archivos corruptos se eliminan aquí, evitando
    // que Baileys los cargue y falle en descifrado con Bad MAC.
    await verifyAndReport(config.sessionPath).catch(() => {})

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
      connectTimeoutMs:               30_000,
      keepAliveIntervalMs:            25_000,
      defaultQueryTimeoutMs:          60_000,
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
        this._startZombieWatchdog()
        logger.info('WinsiBot conectado')
        this.emit('ready', this.sock!)

        // precargar grupos en background — no bloquea la conexión ni el handler de mensajes
        // timeout de 30s para evitar colgar en grupos grandes (10k+)
        const sockRef = this.sock!
        Promise.race([
          sockRef.groupFetchAllParticipating(),
          new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), 30_000)),
        ]).then(groups => {
          const keys = Object.keys(groups)
          for (const groupJid of keys) {
            winsiStore.preloadFromData(groupJid, (groups as Record<string, any>)[groupJid])
          }
          logger.info(`${keys.length} grupos precargados`)
        }).catch(err => {
          logger.warn({ err }, 'Error precargando grupos (no crítico — se cargan bajo demanda)')
        })
      }
    })

    // ─── mensajes entrantes ───────────────────────────────────────────────────
    this.sock.ev.on('messages.upsert', ({ messages, type }) => {
      // Log incondicional ANTES de cualquier filtro — si esto deja de aparecer
      // durante un "colgado", el problema es que Baileys dejó de emitir el
      // evento (socket realmente zombie). Si SÍ aparece pero no hay log de
      // "Handler" después, el mensaje se está filtrando o el semáforo está lleno.
      logger.info({ count: messages.length, type }, 'messages.upsert')

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
        const groupJid = msg.key.remoteJid ?? ''
        console.log(
          `  ${color.red('◈')} ${color.bold(color.red('Bad MAC'))}  ${chatLabel} ${color.dim(jidShort)}  ${meLabel}`
        )
        // ─── Bad MAC flood detection — por grupo, aislado ──────────────────
        // Un grupo con flood NO afecta a los demás grupos.
        this._handleBadMac(groupJid)
        return
      }

      console.log(
        `  ${color.blue('◈')} ${color.bold('Mensaje')}  ${chatLabel} ${color.dim(jidShort)}  ${meLabel}`
      )

      this.emit('message', msg, this.sock!)
    })
  }

  getSocket(): WASocket | null { return this.sock  }

  // ─── Watchdog de conexión zombie ────────────────────────────────────────
  // Cada ZOMBIE_CHECK_INTERVAL_MS manda un IQ de ping real (el mismo que usa
  // Baileys internamente) y espera la respuesta del servidor — no asume que
  // "sin error al escribir" signifique "WhatsApp está escuchando". Si no hay
  // respuesta a tiempo, fuerza una reconexión completa. Corre siempre, sin
  // esperar un período de silencio primero, porque la conexión puede quedar
  // zombie a los pocos minutos de conectar.
  private _startZombieWatchdog(): void {
    if (this.zombieCheckTimer) clearInterval(this.zombieCheckTimer)

    this.zombieCheckTimer = setInterval(async () => {
      if (!this.sock) return

      try {
        await this.sock.query(
          {
            tag: 'iq',
            attrs: { to: S_WHATSAPP_NET, type: 'get', xmlns: 'w:p' },
            content: [{ tag: 'ping', attrs: {} }],
          },
          this.ZOMBIE_PROBE_TIMEOUT_MS,
        )
      } catch (err) {
        logger.warn({ err }, 'Conexión zombie detectada (sin respuesta al ping) — forzando reconexión')
        if (this.zombieCheckTimer) {
          clearInterval(this.zombieCheckTimer)
          this.zombieCheckTimer = null
        }
        this.cleanup()
        this.scheduleReconnect()
      }
    }, this.ZOMBIE_CHECK_INTERVAL_MS).unref()
  }

  // ─── Limpieza periódica de mapas en memoria ────────────────────────────────
  // Previene leak de memoria en bots con miles de grupos activos.
  private _startMemoryTrim(): void {
    setInterval(() => {
      const now = Date.now()
      // Limpiar entradas de Bad MAC inactivas (ventana expirada hace 5+ min)
      for (const [jid, entry] of this.badMacByGroup) {
        if (now - entry.windowStart > LOCAL_BAD_MAC_WINDOW_MS * 10) {
          this.badMacByGroup.delete(jid)
        }
      }
      // Limpiar clearingGroups atascados (seguridad: no debería quedar > 30s)
      if (this.clearingGroups.size > 10) {
        this.clearingGroups.clear()
      }
    }, 5 * 60_000).unref()
  }

  // ─── Bad MAC — por grupo, aislado ──────────────────────────────────────────
  // Primero consulta Rust (fuente de verdad). Si Rust no está disponible,
  // usa el tracker en proceso como fallback.
  private _handleBadMac(groupJid: string): void {
    if (!groupJid || this.clearingGroups.has(groupJid)) return

    // Intentar con Rust primero (async, no bloquea el hilo)
    import('@lib/session.js').then(({ sessionClient }) => {
      return sessionClient.reportBadMac(groupJid)
    }).then(({ count, shouldClear }) => {
      if (shouldClear) {
        this._doClearForGroup(groupJid, count, 'Rust')
      }
    }).catch(() => {
      // Rust no disponible — usar fallback local
      this._localBadMacCheck(groupJid)
    })
  }

  private _localBadMacCheck(groupJid: string): void {
    if (this.clearingGroups.has(groupJid)) return
    const now  = Date.now()
    let entry  = this.badMacByGroup.get(groupJid)
    if (!entry) {
      entry = { count: 0, windowStart: now, clearedAt: 0 }
      this.badMacByGroup.set(groupJid, entry)
    }
    // Cooldown post-clear
    if (now - entry.clearedAt < LOCAL_BAD_MAC_COOLDOWN) return
    // Reset ventana si expiró
    if (now - entry.windowStart > LOCAL_BAD_MAC_WINDOW_MS) {
      entry.count       = 0
      entry.windowStart = now
    }
    entry.count++
    if (entry.count >= LOCAL_BAD_MAC_THRESHOLD) {
      entry.count     = 0
      entry.clearedAt = now
      this._doClearForGroup(groupJid, LOCAL_BAD_MAC_THRESHOLD, 'local')
    }
  }

  private _doClearForGroup(groupJid: string, count: number, source: string): void {
    this.clearingGroups.add(groupJid)
    logger.warn(
      `[socket] ${count} Bad MACs en grupo ${groupJid.replace('@g.us', '')} (${source}) — limpiando Signal + reconectando`
    )
    import('@lib/session.js').then(({ sessionClient }) =>
      sessionClient.clearSignalSessions()
    ).then(res => {
      logger.info(`[socket] ${res.deleted} archivos Signal eliminados — reconectando`)
      this.clearingGroups.delete(groupJid)
      this.cleanup()
      this.scheduleReconnect()
    }).catch(err => {
      logger.warn({ err }, '[socket] clearSignalSessions falló — reconectando igual')
      this.clearingGroups.delete(groupJid)
      this.cleanup()
      this.scheduleReconnect()
    })
  }
}