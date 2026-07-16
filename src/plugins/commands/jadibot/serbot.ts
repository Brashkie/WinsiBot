import type { Command } from '../../../types/index.js'
import {
  makeWASocket,
  useMultiFileAuthState,
  makeCacheableSignalKeyStore,
  fetchLatestBaileysVersion,
  DisconnectReason,
} from '@whiskeysockets/baileys'
import { safeSend } from '@lib/media_sender.js'
import { handleMessage } from '@core/handler.js'
import { getGroupMetadata } from '@core/groupCache.js'
import { logger } from '@core/logger.js'
import { color, themes } from 'ansimax'
import pino from 'pino'
import qrcode from 'qrcode'
import path from 'path'
import fs from 'fs'

// ─── Config ────────────────────────────────────────────────────────────────────

// Configurable por env — el default (250) es una suba conservadora desde el
// viejo hardcode de 100: cada sub-bot conectado es un WASocket completo (su
// propia sesión Signal + WebSocket en memoria), no un proceso aparte, así que
// el techo real depende de la RAM del server, no del código. Subilo con
// SUBBOT_MAX si el server aguanta más — Rust es la fuente de verdad real
// (ver syncSubBotLimitToRust más abajo), esto es solo el cap local en TS.
const MAX_SUBBOTS    = Number(process.env.SUBBOT_MAX) || 250
const SUB_DIR        = path.join(process.cwd(), 'data', 'subbots')
const RUST_URL       = process.env.RUST_API_URL ?? 'http://localhost:3001'
const RUST_KEY       = process.env.RUST_API_KEY ?? ''
const RECONNECT_CAP  = 64_000       // ms — backoff cap per bot

fs.mkdirSync(SUB_DIR, { recursive: true })

// Sincroniza el límite de TS con la cuota real de Rust (PATCH /subbots/config,
// hot-reload sin reiniciar Rust) — sin esto, subir SUBBOT_MAX acá no serviría
// de nada porque Rust seguiría rechazando en su propio default (100).
export async function syncSubBotLimitToRust(): Promise<void> {
  const res = await rustFetch('/subbots/config', 'PATCH', { maxSubbots: MAX_SUBBOTS })
  if (res?.maxSubbots === MAX_SUBBOTS) {
    logger.info(`Sub-bots: límite sincronizado con Rust (${MAX_SUBBOTS})`)
  } else {
    logger.warn({ res }, 'Sub-bots: no se pudo sincronizar el límite con Rust — puede seguir usando su default')
  }
}

// Un solo logger "silencioso" reusado por todos los sub-bots — Baileys crea un
// child logger internamente por socket, así que no hay riesgo de estado
// compartido entre bots; evita instanciar un pino nuevo por cada conexión o
// reconexión (relevante con hasta MAX_SUBBOTS bots reconectando a la vez).
const SILENT_LOGGER = pino({ level: 'silent' })

// La versión de Baileys casi nunca cambia — cachearla evita un fetch HTTP
// extra por cada conexión/reconexión de CADA sub-bot (con 100 sub-bots
// reconectando tras un corte de red, eran hasta 100 llamadas redundantes).
let cachedVersion:   [number, number, number] | null = null
let versionCachedAt  = 0
const VERSION_TTL_MS = 60 * 60_000 // 1h

async function getBaileysVersion(): Promise<[number, number, number]> {
  if (cachedVersion && Date.now() - versionCachedAt < VERSION_TTL_MS) return cachedVersion
  try {
    const { version } = await fetchLatestBaileysVersion()
    cachedVersion  = version
    versionCachedAt = Date.now()
  } catch (err) {
    if (!cachedVersion) throw err
    logger.warn({ err }, 'Sub-bot: no se pudo refrescar versión de Baileys, usando la cacheada')
  }
  return cachedVersion!
}

// ─── Registry (sockets only — state is tracked by Rust) ───────────────────────

export interface SubBot {
  phone:                string
  jid:                  string
  name:                 string
  sock:                 any
  status:               'connecting' | 'connected' | 'disconnected'
  connectedAt:          number
  method:                'qr' | 'code'
  ownerJid:             string
  msgCount:             number
  lastMessageAt:        number
  lastDisconnectReason?: string
  lastDisconnectAt?:     number
}

export const subBots = new Map<string, SubBot>()

// ─── Diagnóstico — por qué se cayó ────────────────────────────────────────────
function describeDisconnectReason(code: number | undefined): string {
  switch (code) {
    case DisconnectReason.badSession:          return 'Sesión corrupta'
    case DisconnectReason.connectionClosed:    return 'Conexión cerrada'
    case DisconnectReason.connectionLost:      return 'Conexión perdida (red)'
    case DisconnectReason.connectionReplaced:  return 'Reemplazada por otro dispositivo'
    case DisconnectReason.loggedOut:           return 'Sesión cerrada (logout)'
    case DisconnectReason.restartRequired:     return 'WhatsApp pidió reiniciar'
    case DisconnectReason.multideviceMismatch: return 'Desajuste multi-dispositivo'
    case DisconnectReason.forbidden:           return 'Prohibido por WhatsApp (403)'
    case DisconnectReason.unavailableService:  return 'Servicio no disponible (503)'
    case 405:                                  return 'Método no permitido (405)'
    case undefined:                            return 'Error desconocido'
    default:                                   return `Código ${code}`
  }
}

// Teléfonos cuyo cierre de socket fue provocado a propósito (QR expirado,
// !stopbot) — el handler de 'connection.update' lo chequea para NO agendar
// una reconexión automática (que generaría un QR nuevo solo, en bucle).
const intentionalCloses = new Set<string>()

// ─── Rust API helpers ─────────────────────────────────────────────────────────

async function rustFetch(path: string, method: string, body?: unknown): Promise<any> {
  try {
    const init: RequestInit = {
      method,
      headers: { 'Content-Type': 'application/json', 'x-api-key': RUST_KEY },
    }
    if (body !== undefined) init.body = JSON.stringify(body)
    const res = await fetch(`${RUST_URL}${path}`, init)
    return res.json().catch(() => ({ ok: false }))
  } catch {
    return { ok: false }
  }
}

async function rustRegister(sessionId: string, ownerJid: string, sessionPath: string): Promise<{ ok: boolean; message?: string }> {
  return rustFetch('/subbots/register', 'POST', {
    sessionId,
    ownerJid,
    sessionPath,
    parentSessionId: 'main',
  })
}

async function rustUnregister(sessionId: string): Promise<void> {
  await rustFetch(`/subbots/${encodeURIComponent(sessionId)}`, 'DELETE')
}

async function rustSetState(sessionId: string, state: string): Promise<void> {
  await rustFetch(`/subbots/${encodeURIComponent(sessionId)}/state`, 'PUT', { state })
}

async function rustHeartbeat(sessionId: string): Promise<void> {
  await rustFetch(`/subbots/${encodeURIComponent(sessionId)}/heartbeat`, 'POST')
}

async function rustCanCreate(ownerJid: string): Promise<{ can_create: boolean; reason?: string; unavailable?: boolean }> {
  try {
    const res = await fetch(`${RUST_URL}/subbots/can-create?owner=${encodeURIComponent(ownerJid)}`, {
      headers: { 'x-api-key': RUST_KEY },
    })
    if (!res.ok) return { can_create: false, reason: `Rust respondió ${res.status}`, unavailable: true }
    return await res.json()
  } catch {
    // Distinguir "Rust caído/puerto mal configurado" de "cuota realmente excedida"
    // — antes ambos casos mostraban el mismo "cuota excedida", lo que escondió
    // un bug de puerto (3010 en vez de 3001) detrás de un mensaje engañoso.
    return { can_create: false, reason: 'Rust no disponible', unavailable: true }
  }
}

// ─── Per-bot heartbeat loop ───────────────────────────────────────────────────

const heartbeatTimers = new Map<string, NodeJS.Timeout>()

// NOTA: antes este chequeo comparaba `subBots.has(sessionId)` contra un mapa
// indexado por `phone` (sessionId es `subbot-<phone>`, una clave distinta) —
// la condición era siempre verdadera y el heartbeat se autodetenía en su
// primer tick sin llegar a avisarle nunca a Rust. Ahora se chequea por
// `phone`, que es la clave real de `subBots`.
function startHeartbeat(phone: string, sessionId: string): void {
  stopHeartbeat(sessionId)
  const t = setInterval(() => {
    if (!subBots.has(phone)) { stopHeartbeat(sessionId); return }
    rustHeartbeat(sessionId).catch(() => {})
  }, 30_000)
  heartbeatTimers.set(sessionId, t)
}

function stopHeartbeat(sessionId: string): void {
  const t = heartbeatTimers.get(sessionId)
  if (t) { clearInterval(t); heartbeatTimers.delete(sessionId) }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getSubPath(phone: string): string {
  return path.join(SUB_DIR, phone)
}

function sessionIdFor(phone: string): string {
  return `subbot-${phone}`
}

// ─── Iniciar sub-bot ──────────────────────────────────────────────────────────

export async function startSubBot(
  phone:       string,
  method:      'qr' | 'code',
  sock:        any,
  chatJid:     string,
  msg:         any,
  ownerJid:    string,
  retries    = 0,
  registeredInRust = false,
): Promise<void> {
  const subPath   = getSubPath(phone)
  const sessionId = sessionIdFor(phone)

  fs.mkdirSync(subPath, { recursive: true })

  let rustRegistered = registeredInRust

  // First connection: register in Rust (already checked quota before calling)
  if (!rustRegistered) {
    const reg = await rustRegister(sessionId, ownerJid, subPath)
    if (!reg.ok) {
      await safeSend(() => sock.sendMessage(chatJid, {
        text: `✗ No se pudo registrar el sub-bot: ${reg.message ?? 'error desconocido'}`,
      }, { quoted: msg })).catch(() => {})
      return
    }
    rustRegistered = true
  }

  const version             = await getBaileysVersion()
  const { state, saveCreds } = await useMultiFileAuthState(subPath)

  // Referencia mutable para que cachedGroupMetadata (abajo) pueda usar el
  // socket una vez creado — Baileys solo la invoca después de construir el
  // socket por completo, así que para ese momento subSockRef ya está seteada.
  let subSockRef: any

  const subSock = makeWASocket({
    version,
    logger:            SILENT_LOGGER,
    printQRInTerminal: false,
    auth: {
      creds: state.creds,
      keys:  makeCacheableSignalKeyStore(state.keys, SILENT_LOGGER),
    },
    browser: method === 'code'
      ? ['Windows', 'Chrome', '110.0.5585.95']
      : ['WinsiBot-SubBot', 'Chrome', '2.0.0'],
    generateHighQualityLinkPreview: true,
    // Mismo fix que el bot principal — evita que Baileys vuelva a pedir
    // groupMetadata a WhatsApp en cada mensaje enviado (causa de los
    // "rate-overlimit"). Reusa el mismo cache global de groupCache.ts.
    cachedGroupMetadata: async (jid: string) => {
      if (!subSockRef) return undefined
      return getGroupMetadata(subSockRef, jid)
    },
  })
  subSockRef = subSock

  subBots.set(phone, {
    phone,
    jid:           `${phone}@s.whatsapp.net`,
    name:          phone,
    sock:          subSock,
    status:        'connecting',
    connectedAt:   0,
    method,
    ownerJid,
    msgCount:      0,
    lastMessageAt: 0,
  })

  await rustSetState(sessionId, 'Connecting').catch(() => {})
  startHeartbeat(phone, sessionId)

  let qrMsg:   any = null
  let codeMsg: any = null
  let codeSent     = false
  let qrSent       = false

  subSock.ev.on('connection.update', async (update: any) => {
    // Todo el cuerpo envuelto en try/catch — antes un error inesperado acá
    // (Baileys no espera el resultado de listeners async, así que un throw
    // se vuelve un unhandledRejection) dependía por completo de que el
    // filtro global de mensajes conocidos en index.ts lo reconociera; si no
    // matcheaba ningún patrón, tumbaba TODO el proceso — bot principal y
    // los demás sub-bots incluidos — por un error de UN solo sub-bot.
    try {
      await handleConnectionUpdate(update)
    } catch (err) {
      logger.warn({ err, phone }, 'Sub-bot: error en connection.update — aislado, no afecta a los demás')
    }
  })

  async function handleConnectionUpdate(update: any): Promise<void> {
    const { connection, lastDisconnect, qr } = update

    // ─── QR ────────────────────────────────────────────────────────────────
    // WhatsApp rota el QR internamente cada ~20-30s mientras espera el escaneo,
    // y Baileys emite un evento `qr` nuevo en cada rotación. Antes reenviábamos
    // una imagen por cada rotación (spam en el chat) — ahora se manda UNA sola
    // vez; si no se escanea a tiempo, se borra y se pide escribir el comando
    // de nuevo en vez de seguir reintentando solo.
    if (qr && method === 'qr' && !qrSent) {
      qrSent = true
      try {
        const qrBuffer = await qrcode.toBuffer(qr, { scale: 8 })

        qrMsg = await safeSend(() => sock.sendMessage(chatJid, {
          image:   qrBuffer,
          caption: [
            `◈ *Escanea el QR con WhatsApp*`,
            ``,
            `§ Ve a WhatsApp → Dispositivos vinculados → Vincular dispositivo`,
            `§ Escanea este QR`,
            `§ Expira en 45s`,
          ].join('\n'),
        }, { quoted: msg }))

        setTimeout(async () => {
          if (subBots.get(phone)?.status === 'connected') return

          if (qrMsg?.key)
            await safeSend(() => sock.sendMessage(chatJid, { delete: qrMsg.key })).catch(() => {})

          await safeSend(() => sock.sendMessage(chatJid, {
            text: `§ El QR expiró\n§ Escribe *#serbot* de nuevo para generar otro`,
          })).catch(() => {})

          intentionalCloses.add(phone)
          stopHeartbeat(sessionId)
          try { subSock.end?.(undefined) } catch {}
          subBots.delete(phone)
          await rustSetState(sessionId, 'Disconnected').catch(() => {})
          await rustUnregister(sessionId).catch(() => {})
        }, 45_000)
      } catch {}
    }

    // ─── Pairing code ─────────────────────────────────────────────────────
    if (qr && method === 'code' && !codeSent) {
      codeSent = true
      try {
        const raw    = await subSock.requestPairingCode(phone)
        const secret = raw?.match(/.{1,4}/g)?.join('-') ?? raw

        codeMsg = await safeSend(() => sock.sendMessage(chatJid, {
          text: [
            `◈ *Código de emparejamiento*`,
            ``,
            `  *${secret}*`,
            ``,
            `§ Ve a WhatsApp → Dispositivos vinculados → Vincular con número de teléfono`,
            `§ Ingresa el código de arriba`,
            `§ Expira en 60s`,
          ].join('\n'),
        }, { quoted: msg }))

        setTimeout(() => {
          if (codeMsg?.key)
            safeSend(() => sock.sendMessage(chatJid, { delete: codeMsg.key })).catch(() => {})
        }, 60_000)
      } catch (e: any) {
        await safeSend(() => sock.sendMessage(chatJid, {
          text: `✗ Error al generar código: ${e?.message ?? 'desconocido'}`,
        }, { quoted: msg })).catch(() => {})
      }
    }

    // ─── Conectado ─────────────────────────────────────────────────────────
    if (connection === 'open') {
      const name = subSock.user?.name ?? phone
      const sjid = subSock.user?.id   ?? `${phone}@s.whatsapp.net`

      // El número real del dispositivo ya conectado — no el "phone" que abrió
      // el flujo, que puede venir de un @lid (identificador opaco, no un
      // teléfono real) si quien escribió #serbot tenía la privacidad de
      // número activada.
      const realPhone = (sjid.split('@')[0]?.split(':')[0] ?? '').replace(/[^0-9]/g, '') || phone
      const prev      = subBots.get(phone)

      subBots.set(phone, {
        phone,
        jid:           sjid,
        name,
        sock:          subSock,
        status:        'connected',
        connectedAt:   Date.now(),
        method,
        ownerJid,
        msgCount:      prev?.msgCount ?? 0,
        lastMessageAt: prev?.lastMessageAt ?? 0,
      })

      console.log(`  ${themes.success('◈')} ${color.bold('Sub-bot')}  ${color.dim('+' + realPhone)}  ${themes.success('conectado')}`)
      await rustSetState(sessionId, 'Connected').catch(() => {})

      try {
        fs.writeFileSync(
          path.join(subPath, 'meta.json'),
          JSON.stringify({ phone, name, method, chatJid, ownerJid, connectedAt: new Date().toISOString() }, null, 2)
        )
      } catch {}

      for (const k of [qrMsg?.key, codeMsg?.key]) {
        if (k) safeSend(() => sock.sendMessage(chatJid, { delete: k })).catch(() => {})
      }

      await safeSend(() => sock.sendMessage(chatJid, {
        text: [
          `✔ *Conectado como sub-bot*`,
          ``,
          ` Nombre:  *${name}*`,
          ` Número:  *+${realPhone}*`,
          ` Método:  *${method === 'code' ? 'Código' : 'QR'}*`,
          ``,
          `§ Para desconectarte escribe *!stopbot*`,
        ].join('\n'),
      }, { quoted: msg })).catch(() => {})
    }

    // ─── Desconectado ──────────────────────────────────────────────────────
    if (connection === 'close') {
      // Cierre provocado por nosotros (QR expiró, !stopbot) — ya se limpió
      // todo en el lugar que lo disparó, no reconectar ni renotificar.
      if (intentionalCloses.delete(phone)) return

      const reason = (lastDisconnect?.error as any)?.output?.statusCode
      const reasonText = describeDisconnectReason(reason)

      const current = subBots.get(phone)
      if (current) {
        subBots.set(phone, {
          ...current,
          status:               'disconnected',
          sock:                 null,
          lastDisconnectReason: reasonText,
          lastDisconnectAt:     Date.now(),
        })
      }

      // Permanent logout — clean up entirely
      if (reason === DisconnectReason.loggedOut || reason === 401 || reason === 405) {
        console.log(`  ${themes.error('◈')} ${color.bold('Sub-bot')}  ${color.dim(phone)}  ${themes.error('logout permanente')}`)
        stopHeartbeat(sessionId)
        fs.rmSync(subPath, { recursive: true, force: true })
        subBots.delete(phone)
        await rustSetState(sessionId, 'LoggedOut').catch(() => {})
        await rustUnregister(sessionId).catch(() => {})
        if (chatJid) {
          await safeSend(() => sock.sendMessage(chatJid, {
            text: `✗ Sesión cerrada permanentemente\n§ Usa *!serbot* para reconectarte`,
          })).catch(() => {})
        }
        return
      }

      // Replaced on another device
      if (reason === 440) {
        console.log(`  ${themes.warning('◈')} ${color.bold('Sub-bot')}  ${color.dim(phone)}  ${themes.warning('sesión reemplazada')}`)
        stopHeartbeat(sessionId)
        subBots.delete(phone)
        await rustSetState(sessionId, 'Disconnected').catch(() => {})
        await rustUnregister(sessionId).catch(() => {})
        if (chatJid) {
          await safeSend(() => sock.sendMessage(chatJid, {
            text: `§ Sesión reemplazada por otro dispositivo\n§ Usa *!serbot* para reconectar`,
          })).catch(() => {})
        }
        return
      }

      // Infinite exponential reconnect — backoff capped at RECONNECT_CAP.
      // + jitter (up to 1s) so subbots don't all reconnect at the exact same
      // instant after a shared network blip.
      const delay = Math.min(1_000 * 2 ** retries, RECONNECT_CAP) + Math.floor(Math.random() * 1000)
      console.log(`  ${color.yellow('◈')} ${color.bold('Sub-bot')}  ${color.dim(phone)}  reconectando en ${Math.round(delay / 1000)}s ${color.dim(`(intento #${retries + 1})`)}`)
      await rustSetState(sessionId, 'Reconnecting').catch(() => {})

      setTimeout(() => {
        codeSent = false
        // Pass registeredInRust=true so we skip re-registering in Rust
        startSubBot(phone, method, sock, chatJid, null, ownerJid, retries + 1, true)
          .catch(err => {
            logger.warn({ err, phone }, 'Sub-bot: reconexión falló')
          })
      }, delay)
    }
  }

  // ─── Mensajes entrantes ───────────────────────────────────────────────────
  // Cada sub-bot procesa comandos con el mismo handler central que el bot
  // principal — comparte su semáforo de concurrencia global (MAX_CONCURRENT
  // en handler.ts), así que ráfagas de mensajes en cualquier combinación de
  // sub-bots + bot principal se absorben con el mismo cupo acotado, sin que
  // uno solo pueda saturar el event loop del proceso.
  subSock.ev.on('messages.upsert', ({ messages, type }: any) => {
    try {
      if (type !== 'notify' && type !== 'append') return

      const m = messages?.[0]
      if (!m) return

      // 'append' = backlog post-sync — descartar todo lo más viejo que 5min
      // para no reprocesar historial como si fueran comandos en vivo.
      if (type === 'append') {
        const ts = Number(m.messageTimestamp ?? 0) * 1000
        if (!ts || Date.now() - ts > 5 * 60_000) return
      }

      const bot = subBots.get(phone)
      if (bot) {
        bot.msgCount++
        bot.lastMessageAt = Date.now()
      }

      handleMessage(m, subSock).catch(err => {
        logger.warn({ err, phone }, 'Sub-bot: error en handleMessage')
      })
    } catch (err) {
      logger.warn({ err, phone }, 'Sub-bot: error procesando messages.upsert')
    }
  })

  subSock.ev.on('creds.update', saveCreds)
}

// ─── Restaurar sub-bots al arrancar ───────────────────────────────────────────

export async function restoreSubBots(mainSock: any): Promise<void> {
  await syncSubBotLimitToRust().catch(() => {})

  if (!fs.existsSync(SUB_DIR)) return

  const folders = fs.readdirSync(SUB_DIR).filter(f =>
    fs.statSync(path.join(SUB_DIR, f)).isDirectory()
  )

  let restored = 0
  let failed   = 0

  for (const phone of folders) {
    const credsPath = path.join(getSubPath(phone), 'creds.json')
    if (!fs.existsSync(credsPath)) continue

    try {
      const metaRaw = fs.readFileSync(path.join(getSubPath(phone), 'meta.json'), 'utf-8')
      const meta    = JSON.parse(metaRaw)
      const method   = (meta?.method  ?? 'qr') as 'qr' | 'code'
      const chatJid  = meta?.chatJid  ?? `${phone}@s.whatsapp.net`
      const ownerJid = meta?.ownerJid ?? `${phone}@s.whatsapp.net`

      if (subBots.size >= MAX_SUBBOTS) break

      // Re-register in Rust (server may have restarted)
      await startSubBot(phone, method, mainSock, chatJid, null, ownerJid, 0, false)
      restored++
    } catch (err: any) {
      failed++
      logger.warn({ err: err?.message ?? err, phone }, 'Sub-bot: restauración falló')
    }
  }

  if (restored || failed) {
    console.log(`  ${themes.success('◈')} ${color.bold('Sub-bots')}  ${restored} restaurados${failed ? color.dim(`, ${failed} fallidos`) : ''}`)
  }
}

// ─── Stop sub-bot (for !stopbot command) ─────────────────────────────────────
// Punto único de limpieza — evita duplicar la lógica de cierre en cada
// comando que necesite desconectar un sub-bot (antes !stopbot reimplementaba
// esto a mano y se saltaba stopHeartbeat/intentionalCloses/rustUnregister,
// dejando el heartbeat corriendo al aire y la cuota de Rust sin liberar).
export async function stopSubBot(phone: string): Promise<boolean> {
  const bot = subBots.get(phone)
  if (!bot) return false

  const sessionId = sessionIdFor(phone)
  intentionalCloses.add(phone)
  stopHeartbeat(sessionId)

  try { bot.sock?.ev?.removeAllListeners() } catch {}
  try {
    // logout() desvincula el dispositivo en WhatsApp; si falla (ya sin
    // conexión, por ejemplo) se cierra el socket directamente.
    await bot.sock?.logout()
  } catch {
    try { bot.sock?.ws?.close() } catch {}
    try { bot.sock?.end?.(undefined) } catch {}
  }

  subBots.delete(phone)

  await rustSetState(sessionId, 'Disconnected').catch(() => {})
  await rustUnregister(sessionId).catch(() => {})

  return true
}

// ─── List text ────────────────────────────────────────────────────────────────

function buildListText(prefix: string): string {
  if (subBots.size === 0) {
    return `§ No hay sub-bots activos\n> Usa *${prefix}serbot* para conectar uno`
  }

  const statusIcon = (s: SubBot) =>
    s.status === 'connected'  ? '✔' :
    s.status === 'connecting' ? '⏳' : '✗'

  const lines = [...subBots.values()].map((b, i) => {
    const since = b.connectedAt
      ? `· ${Math.floor((Date.now() - b.connectedAt) / 60_000)}m`
      : ''
    const msgs = b.msgCount ? `· ${b.msgCount} msj` : ''
    const main = ` ${i + 1}. ${statusIcon(b)} *${b.name}* (+${b.phone}) ${since} ${msgs}`

    // Motivo de la última caída — solo tiene sentido mostrarlo si no está conectado.
    if (b.status !== 'connected' && b.lastDisconnectReason) {
      const ago = b.lastDisconnectAt
        ? `hace ${Math.floor((Date.now() - b.lastDisconnectAt) / 60_000)}m`
        : ''
      return `${main}\n     ╰ ${b.lastDisconnectReason} ${ago}`
    }
    return main
  })

  const disconnected = [...subBots.values()].filter(b => b.status === 'disconnected').length

  return [
    `◈ *Sub-bots activos — ${subBots.size}/${MAX_SUBBOTS}*`,
    ``,
    ...lines,
    ``,
    `§ ${prefix}stopbot  para desconectarte`,
    disconnected ? `§ ${prefix}serbot reconectar  — reintentar los ${disconnected} caídos ahora` : '',
  ].filter(Boolean).join('\n')
}

// ─── Command ──────────────────────────────────────────────────────────────────

const command: Command = {
  name:        'serbot',
  aliases:     ['jadibot', 'subbot', 'listbots', 'botslist'],
  description: 'Conviértete en sub-bot  |  serbot lista — ver activos',
  category:    'jadibot',

  async execute({ sock, jid, msg, args, sender, isGroup, isOwner, command: cmd, prefix }) {
    const sub = args[0]?.toLowerCase()

    // ─── Lista — funciona en grupos y privado ─────────────────────────────
    if (cmd === 'listbots' || cmd === 'botslist' || sub === 'lista' || sub === 'list') {
      await safeSend(() => sock.sendMessage(jid, {
        text: buildListText(prefix),
      }, { quoted: msg }))
      return
    }

    // ─── Reconectar en lote — fuerza el reintento YA en vez de esperar el
    // backoff exponencial de cada sub-bot caído (útil tras un corte de red
    // compartido que tumbó varios de golpe). Solo el owner: afecta sub-bots
    // de cualquier usuario, no solo los propios.
    if (sub === 'reconectar' || sub === 'reconnect') {
      if (!isOwner) {
        await safeSend(() => sock.sendMessage(jid, {
          text: `✗ Solo el owner puede forzar la reconexión de todos los sub-bots.`,
        }, { quoted: msg }))
        return
      }

      const targets = [...subBots.entries()].filter(([, b]) => b.status === 'disconnected')
      if (!targets.length) {
        await safeSend(() => sock.sendMessage(jid, {
          text: `§ No hay sub-bots caídos esperando reconexión.`,
        }, { quoted: msg }))
        return
      }

      await safeSend(() => sock.sendMessage(jid, {
        text: `◈ Reconectando ${targets.length} sub-bot(s)...`,
      }, { quoted: msg }))

      for (const [phone, bot] of targets) {
        let chatJid = jid
        try {
          const meta = JSON.parse(fs.readFileSync(path.join(getSubPath(phone), 'meta.json'), 'utf-8'))
          chatJid = meta?.chatJid ?? jid
        } catch {}

        startSubBot(phone, bot.method, sock, chatJid, null, bot.ownerJid, 0, true).catch(err => {
          logger.warn({ err, phone }, 'Sub-bot: reconexión manual falló')
        })
      }
      return
    }

    // ─── Solo en privado para conectarse ──────────────────────────────────
    if (isGroup) {
      await safeSend(() => sock.sendMessage(jid, {
        text: `§ Este comando solo funciona en privado\n§ Escríbeme directamente a mí`,
      }, { quoted: msg }))
      return
    }

    // WhatsApp oculta el número real detrás de un "@lid" cuando el usuario tiene
    // activada la privacidad de número — esos dígitos NO son un teléfono real,
    // son un identificador interno opaco. No hay forma de revertirlo con Baileys
    // hoy, así que solo se usa como clave interna; nunca se muestra como "+número".
    const isLid = sender.endsWith('@lid')
    const phone = sender
      .replace('@s.whatsapp.net', '')
      .replace('@lid', '')
      .replace(/[^0-9]/g, '')

    if (!phone) {
      await safeSend(() => sock.sendMessage(jid, {
        text: `✗ No se pudo determinar tu número`,
      }, { quoted: msg }))
      return
    }

    // ─── Ya conectado ─────────────────────────────────────────────────────
    if (subBots.get(phone)?.status === 'connected') {
      await safeSend(() => sock.sendMessage(jid, {
        text: [
          `§ Ya estás conectado como sub-bot`,
          ``,
          `§ Para desconectarte: *${prefix}stopbot*`,
        ].join('\n'),
      }, { quoted: msg }))
      return
    }

    // ─── Local cap ────────────────────────────────────────────────────────
    if (subBots.size >= MAX_SUBBOTS) {
      await safeSend(() => sock.sendMessage(jid, {
        text: `✗ Límite de sub-bots alcanzado (${MAX_SUBBOTS})\n§ Espera a que alguno se desconecte`,
      }, { quoted: msg }))
      return
    }

    // ─── Rust quota check ─────────────────────────────────────────────────
    const quota = await rustCanCreate(sender)
    if (!quota.can_create) {
      const text = quota.unavailable
        ? `✗ No se pudo verificar la cuota de sub-bots (Rust no disponible)\n§ Intenta de nuevo en un momento`
        : `✗ No puedes crear un sub-bot ahora\n§ ${quota.reason ?? 'cuota excedida'}`
      await safeSend(() => sock.sendMessage(jid, { text }, { quoted: msg }))
      return
    }

    const method: 'qr' | 'code' = sub === 'code' ? 'code' : 'qr'

    const label = isLid ? 'tu cuenta' : `+${phone}`
    await safeSend(() => sock.sendMessage(jid, {
      text: method === 'code'
        ? `◈ Generando código para *${label}*...`
        : `◈ Generando QR para *${label}*...`,
    }, { quoted: msg }))

    // startSubBot handles Rust registration internally
    startSubBot(phone, method, sock, jid, msg, sender).catch(err => {
      logger.warn({ err: err?.message ?? err, phone }, 'Sub-bot: startSubBot falló')
    })
  },
}

export default command
