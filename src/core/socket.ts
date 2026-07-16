import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  makeCacheableSignalKeyStore,
  fetchLatestBaileysVersion,
  S_WHATSAPP_NET,
  proto,
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
import { getGroupMetadata } from '@core/groupCache.js'
import {
  handleParticipantsUpdate,
  handleGroupsUpdate,
  handleDeleteUpdate,
  handleViewOnce,
  handleCallUpdate,
} from '@core/events.js'
import { handleJoinRequest } from '@core/events/joinRequest.js'

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

// Umbral GLOBAL, independiente del conteo por grupo (Rust y el fallback local
// de arriba son ambos por-grupo). Visto en producción: una sesión Signal
// corrupta a nivel global puede manifestarse como Bad MAC repartidos entre
// MUCHOS grupos distintos — 2-3 por grupo, nunca cruzando el umbral de
// ningún grupo individual — y el bot se queda completamente sordo (ningún
// mensaje se descifra en ningún lado) sin que la limpieza automática se
// dispare nunca. Este contador ve el total sin importar de qué grupo vino.
const GLOBAL_BAD_MAC_THRESHOLD = 8
const GLOBAL_BAD_MAC_WINDOW_MS = 60_000
const GLOBAL_BAD_MAC_COOLDOWN  = 30_000  // un clear global es más disruptivo que uno por grupo

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
  // Marca de tiempo del último 'messages.upsert' recibido (se resetea también
  // al abrir conexión). Con 400+ grupos activos, pasar este tiempo sin NINGÚN
  // evento — ni uno solo, ni siquiera ruido de Bad MAC — aun cuando el ping sí
  // responde, indica que WhatsApp dejó de empujar mensajes a este dispositivo
  // (zombie silencioso post-reconexión).
  // Punto medio a propósito: 20min dejaba al bot sordo demasiado tiempo sin
  // que nadie se enterara; 6min se probó y el zombie volvió a los 6 minutos
  // exactos tras la reconexión — cada reconexión fuerza un refetch completo
  // de metadatos de los 439 grupos, y sospechamos que reconectar tan seguido
  // puede ser lo que hace que WhatsApp empiece a limitar la entrega de
  // mensajes en tiempo real a este dispositivo (círculo vicioso). 10min de
  // margen para observar sin seguir ajustando a ciegas.
  private lastMessageEventAt = 0
  private readonly MESSAGE_STALENESS_LIMIT_MS = 10 * 60_000

  // Per-group Bad MAC tracking (fallback local cuando Rust no responde)
  private badMacByGroup = new Map<string, { count: number; windowStart: number; clearedAt: number }>()
  // Grupos que están en proceso de clear
  private clearingGroups = new Set<string>()

  // Bad MAC global — ver comentario de GLOBAL_BAD_MAC_THRESHOLD arriba
  private globalBadMacEvents: number[] = []   // timestamps dentro de la ventana
  private globalBadMacClearedAt = 0

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
      // Sin esto, Baileys vuelve a pedirle groupMetadata a WhatsApp CADA VEZ
      // que se manda un mensaje a un grupo (para resolver a quién encriptar),
      // sin pasar por nuestro cache de groupCache.ts — con 400+ grupos activos
      // eso es una consulta extra por mensaje enviado, y es lo que estaba
      // causando los "rate-overlimit" (429) de WhatsApp. Reusa el mismo cache
      // (TTL 5min) que ya usa el resto del bot para lo mismo.
      cachedGroupMetadata: async (jid: string) => {
        if (!this.sock) return undefined
        return getGroupMetadata(this.sock, jid)
      },
    })

    winsiStore.bind(this.sock)

    // Bienvenida/despedida (welcome) y avisos de promote/demote/cambio de
    // nombre-descripción (detect) — winsiStore.bind() ya escucha estos mismos
    // eventos pero solo para refrescar el cache de groupMetadata, nunca
    // llamaba a los handlers reales de events/welcome.ts.
    this.sock.ev.on('group-participants.update', (update) => {
      if (!this.sock) return
      handleParticipantsUpdate(this.sock, update).catch(err => {
        logger.warn({ err }, '[welcome] handleParticipantsUpdate falló')
      })
    })
    this.sock.ev.on('groups.update', (updates) => {
      if (!this.sock) return
      handleGroupsUpdate(this.sock, updates).catch(err => {
        logger.warn({ err }, '[welcome] handleGroupsUpdate falló')
      })
    })

    // anticall — rechaza llamadas entrantes cuando está activo (global, no por grupo)
    this.sock.ev.on('call', (calls) => {
      if (!this.sock) return
      handleCallUpdate(this.sock, calls).catch(err => {
        logger.warn({ err }, '[anticall] handleCallUpdate falló')
      })
    })

    // autoAccept/autoReject — solicitudes para unirse a grupos con aprobación
    this.sock.ev.on('group.join-request', (update) => {
      if (!this.sock) return
      handleJoinRequest(this.sock, update).catch(err => {
        logger.warn({ err }, '[joinRequest] handleJoinRequest falló')
      })
    })

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
        this.lastMessageEventAt = Date.now()
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
      this.lastMessageEventAt = Date.now()

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

      // ─── antidelete — "borrar para todos" llega como protocolMessage REVOKE,
      // no como un mensaje normal. El key adentro apunta al mensaje original
      // (no trae su contenido, solo de quién era).
      const revokeKey = msg.message.protocolMessage?.type === proto.Message.ProtocolMessage.Type.REVOKE
        ? msg.message.protocolMessage.key
        : null
      if (revokeKey?.remoteJid) {
        handleDeleteUpdate(this.sock!, {
          fromMe:      !!revokeKey.fromMe,
          id:          revokeKey.id ?? '',
          participant: revokeKey.participant ?? undefined,
          remoteJid:   revokeKey.remoteJid,
        }).catch(err => logger.warn({ err }, '[antidelete] handleDeleteUpdate falló'))
        return
      }

      // ─── antiviewonce — reenvía medios "ver una vez" si el grupo lo activó
      if (msg.message.viewOnceMessageV2 || (msg.message as any).viewOnceMessageV2Extension) {
        handleViewOnce(this.sock!, msg.key.remoteJid ?? '', msg)
          .catch(err => logger.warn({ err }, '[antiviewonce] handleViewOnce falló'))
      }

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
  //
  // El ping por sí solo NO alcanza: hay un modo de falla donde el transporte
  // sigue vivo y responde IQs, pero WhatsApp dejó de empujar 'messages.upsert'
  // a este dispositivo (visto tras ~7-8h apagado — reconecta "ok" pero nunca
  // más loguea un mensaje entrante). Por eso, si el ping responde bien, se
  // revisa también hace cuánto no llega un evento de mensaje; con 433 grupos
  // activos, tanto silencio no es tráfico bajo, es la conexión colgada.
  private _startZombieWatchdog(): void {
    if (this.zombieCheckTimer) clearInterval(this.zombieCheckTimer)

    this.zombieCheckTimer = setInterval(async () => {
      if (!this.sock) return

      const forceReconnect = (reason: string, extra?: Record<string, unknown>) => {
        logger.warn(extra ?? {}, reason)
        if (this.zombieCheckTimer) {
          clearInterval(this.zombieCheckTimer)
          this.zombieCheckTimer = null
        }
        this.cleanup()
        this.scheduleReconnect()
      }

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
        forceReconnect('Conexión zombie detectada (sin respuesta al ping) — forzando reconexión', { err })
        return
      }

      const idleMs = Date.now() - this.lastMessageEventAt
      if (idleMs > this.MESSAGE_STALENESS_LIMIT_MS) {
        forceReconnect(
          'Conexión zombie detectada (ping OK pero sin mensajes entrantes) — forzando reconexión',
          { idleMinutes: Math.round(idleMs / 60_000) },
        )
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
  // Rust es la fuente de verdad, tanto para el umbral por grupo como para el
  // umbral GLOBAL (agregado de todos los grupos — ver rust/src/bad_mac.rs).
  // Si Rust no está disponible, cae al fallback local en TS de abajo, que
  // hace lo mismo (por grupo + global) pero en memoria del proceso.
  private _handleBadMac(groupJid: string): void {
    if (!groupJid) return
    if (this.clearingGroups.has(groupJid)) return

    // Intentar con Rust primero (async, no bloquea el hilo)
    import('@lib/session.js').then(({ sessionClient }) => {
      return sessionClient.reportBadMac(groupJid)
    }).then(({ count, shouldClear, scope }) => {
      if (!shouldClear) return
      if (scope === 'global') {
        this._doClearGlobal(count)
      } else {
        this._doClearForGroup(groupJid, count, 'Rust')
      }
    }).catch(() => {
      // Rust no disponible — usar fallback local (por grupo + global)
      this._localBadMacCheck(groupJid)
      this._globalBadMacCheck()
    })
  }

  private _globalBadMacCheck(): void {
    const now = Date.now()
    if (now - this.globalBadMacClearedAt < GLOBAL_BAD_MAC_COOLDOWN) return

    this.globalBadMacEvents.push(now)
    this.globalBadMacEvents = this.globalBadMacEvents.filter(
      t => now - t <= GLOBAL_BAD_MAC_WINDOW_MS
    )

    if (this.globalBadMacEvents.length >= GLOBAL_BAD_MAC_THRESHOLD) {
      this.globalBadMacEvents  = []
      this.globalBadMacClearedAt = now
      this._doClearGlobal(GLOBAL_BAD_MAC_THRESHOLD)
    }
  }

  private _doClearGlobal(count: number): void {
    logger.warn(
      `[socket] ${count} Bad MACs repartidos entre varios grupos en los últimos ${GLOBAL_BAD_MAC_WINDOW_MS / 1000}s — sesión corrupta a nivel global, limpiando Signal + reconectando`
    )
    import('@lib/session.js').then(({ sessionClient }) =>
      sessionClient.clearSignalSessions()
    ).then(res => {
      logger.info(`[socket] ${res.deleted} archivos Signal eliminados (clear global) — reconectando`)
      this.cleanup()
      this.scheduleReconnect()
    }).catch(err => {
      logger.warn({ err }, '[socket] clearSignalSessions (global) falló — reconectando igual')
      this.cleanup()
      this.scheduleReconnect()
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