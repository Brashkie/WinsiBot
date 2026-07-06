import type { Command } from '../../../types/index.js'
import {
  makeWASocket,
  useMultiFileAuthState,
  makeCacheableSignalKeyStore,
  fetchLatestBaileysVersion,
  DisconnectReason,
} from '@whiskeysockets/baileys'
import { safeSend } from '@lib/media_sender.js'
import pino from 'pino'
import qrcode from 'qrcode'
import path from 'path'
import fs from 'fs'

// ─── Config ────────────────────────────────────────────────────────────────────

const MAX_SUBBOTS    = 100          // hard cap in TypeScript (Rust also enforces)
const SUB_DIR        = path.join(process.cwd(), 'data', 'subbots')
const RUST_URL       = process.env.RUST_API_URL ?? 'http://localhost:3001'
const RUST_KEY       = process.env.RUST_API_KEY ?? ''
const RECONNECT_CAP  = 64_000       // ms — backoff cap per bot

fs.mkdirSync(SUB_DIR, { recursive: true })

// ─── Registry (sockets only — state is tracked by Rust) ───────────────────────

export interface SubBot {
  phone:       string
  jid:         string
  name:        string
  sock:        any
  status:      'connecting' | 'connected' | 'disconnected'
  connectedAt: number
  method:      'qr' | 'code'
  ownerJid:    string
}

export const subBots = new Map<string, SubBot>()

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

function startHeartbeat(sessionId: string): void {
  stopHeartbeat(sessionId)
  const t = setInterval(() => {
    if (!subBots.has(sessionId)) { stopHeartbeat(sessionId); return }
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

  let { version }          = await fetchLatestBaileysVersion()
  let { state, saveCreds } = await useMultiFileAuthState(subPath)

  const subSock = makeWASocket({
    version,
    logger:            pino({ level: 'silent' }),
    printQRInTerminal: false,
    auth: {
      creds: state.creds,
      keys:  makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' })),
    },
    browser: method === 'code'
      ? ['Windows', 'Chrome', '110.0.5585.95']
      : ['WinsiBot-SubBot', 'Chrome', '2.0.0'],
    generateHighQualityLinkPreview: true,
  })

  subBots.set(phone, {
    phone,
    jid:         `${phone}@s.whatsapp.net`,
    name:        phone,
    sock:        subSock,
    status:      'connecting',
    connectedAt: 0,
    method,
    ownerJid,
  })

  await rustSetState(sessionId, 'Connecting').catch(() => {})
  startHeartbeat(sessionId)

  let qrMsg:   any = null
  let codeMsg: any = null
  let codeSent     = false
  let qrSent       = false

  subSock.ev.on('connection.update', async (update: any) => {
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

      subBots.set(phone, {
        phone,
        jid:         sjid,
        name,
        sock:        subSock,
        status:      'connected',
        connectedAt: Date.now(),
        method,
        ownerJid,
      })

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
      const reason = (lastDisconnect?.error as any)?.output?.statusCode

      const current = subBots.get(phone)
      if (current) {
        subBots.set(phone, { ...current, status: 'disconnected', sock: null })
      }

      // Permanent logout — clean up entirely
      if (reason === DisconnectReason.loggedOut || reason === 401 || reason === 405) {
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
      await rustSetState(sessionId, 'Reconnecting').catch(() => {})

      setTimeout(() => {
        codeSent = false
        // Pass registeredInRust=true so we skip re-registering in Rust
        startSubBot(phone, method, sock, chatJid, null, ownerJid, retries + 1, true)
          .catch(err => {
            console.error(`[serbot] reconexión falló para ${phone}:`, err?.message ?? err)
          })
      }, delay)
    }
  })

  subSock.ev.on('creds.update', saveCreds)
}

// ─── Restaurar sub-bots al arrancar ───────────────────────────────────────────

export async function restoreSubBots(mainSock: any): Promise<void> {
  if (!fs.existsSync(SUB_DIR)) return

  const folders = fs.readdirSync(SUB_DIR).filter(f =>
    fs.statSync(path.join(SUB_DIR, f)).isDirectory()
  )

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
    } catch (err: any) {
      console.error(`[serbot] restore falló para ${phone}:`, err?.message ?? err)
    }
  }
}

// ─── Stop sub-bot (for !stopbot command) ─────────────────────────────────────

export async function stopSubBot(phone: string): Promise<boolean> {
  const bot = subBots.get(phone)
  if (!bot) return false

  const sessionId = sessionIdFor(phone)
  stopHeartbeat(sessionId)

  try { bot.sock?.end?.() } catch {}
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
    return ` ${i + 1}. ${statusIcon(b)} *${b.name}* (+${b.phone}) ${since}`
  })

  return [
    `◈ *Sub-bots activos — ${subBots.size}/${MAX_SUBBOTS}*`,
    ``,
    ...lines,
    ``,
    `§ ${prefix}stopbot  para desconectarte`,
  ].join('\n')
}

// ─── Command ──────────────────────────────────────────────────────────────────

const command: Command = {
  name:        'serbot',
  aliases:     ['jadibot', 'subbot', 'listbots', 'botslist'],
  description: 'Conviértete en sub-bot  |  serbot lista — ver activos',
  category:    'jadibot',

  async execute({ sock, jid, msg, args, sender, isGroup, command: cmd, prefix }) {
    const sub = args[0]?.toLowerCase()

    // ─── Lista — funciona en grupos y privado ─────────────────────────────
    if (cmd === 'listbots' || cmd === 'botslist' || sub === 'lista' || sub === 'list') {
      await safeSend(() => sock.sendMessage(jid, {
        text: buildListText(prefix),
      }, { quoted: msg }))
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
      console.error(`[serbot] startSubBot error para ${phone}:`, err?.message ?? err)
    })
  },
}

export default command
