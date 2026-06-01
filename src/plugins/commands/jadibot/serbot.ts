// src/plugins/commands/general/serbot.ts
import type { Command } from '../../../types/index.js'
import { makeWASocket, useMultiFileAuthState, makeCacheableSignalKeyStore, fetchLatestBaileysVersion } from '@whiskeysockets/baileys'
import { safeSend } from '@lib/media_sender.js'
import pino from 'pino'
import qrcode from 'qrcode'
import path from 'path'
import fs from 'fs'

// ─── Registry ─────────────────────────────────────────────────────────────────
export interface SubBot {
  phone:       string
  jid:         string
  name:        string
  sock:        any
  status:      'connecting' | 'connected' | 'disconnected'
  connectedAt: number
  method:      'qr' | 'code'
}

export const subBots = new Map<string, SubBot>()

const SUB_DIR     = path.join(process.cwd(), 'data', 'subbots')
const MAX_RETRIES = 5

fs.mkdirSync(SUB_DIR, { recursive: true })

function getSubPath(phone: string): string {
  return path.join(SUB_DIR, phone)
}

// ─── Iniciar sub-bot ──────────────────────────────────────────────────────────
export async function startSubBot(
  phone:   string,
  method:  'qr' | 'code',
  sock:    any,          // sock principal para enviar mensajes
  chatJid: string,       // jid del privado del usuario
  msg:     any,
  retries = 0,
): Promise<void> {
  const subPath = getSubPath(phone)
  fs.mkdirSync(subPath, { recursive: true })

  const { version }          = await fetchLatestBaileysVersion()
  const { state, saveCreds } = await useMultiFileAuthState(subPath)

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
  })

  let qrMsg:   any = null
  let codeMsg: any = null
  let codeSent     = false

  subSock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update

    // ─── QR ────────────────────────────────────────────────────────────────
    if (qr && method === 'qr') {
      try {
        const qrBuffer = await qrcode.toBuffer(qr, { scale: 8 })
        // borrar QR anterior
        if (qrMsg?.key)
          await safeSend(() => sock.sendMessage(chatJid, { delete: qrMsg.key })).catch(() => {})

        qrMsg = await safeSend(() => sock.sendMessage(chatJid, {
          image:   qrBuffer,
          caption: [
            `◈ *Escanea el QR con WhatsApp*`,
            ``,
            `§ Ve a WhatsApp → Dispositivos vinculados → Vincular dispositivo`,
            `§ Escanea este QR`,
            `§ Expira en 30s — se renovará automáticamente`,
          ].join('\n'),
        }, { quoted: msg }))

        setTimeout(() => {
          if (qrMsg?.key)
            safeSend(() => sock.sendMessage(chatJid, { delete: qrMsg.key })).catch(() => {})
        }, 30_000)
      } catch {}
    }

    // ─── Pairing code — enviar solo una vez ───────────────────────────────
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
          text: `✗ Error al generar código: ${e?.message ?? 'desconocido'}\n§ Intenta con *#serbot* para usar QR`,
        }, { quoted: msg })).catch(() => {})
      }
    }

    // ─── Conectado ─────────────────────────────────────────────────────────
    if (connection === 'open') {
      const name = subSock.user?.name ?? phone
      const sjid = subSock.user?.id   ?? `${phone}@s.whatsapp.net`

      subBots.set(phone, {
        phone,
        jid:         sjid,
        name,
        sock:        subSock,
        status:      'connected',
        connectedAt: Date.now(),
        method,
      })

      // guardar meta
      try {
        fs.writeFileSync(
          path.join(subPath, 'meta.json'),
          JSON.stringify({ phone, name, method, chatJid, connectedAt: new Date().toISOString() }, null, 2)
        )
      } catch {}

      // limpiar QR/code
      for (const k of [qrMsg?.key, codeMsg?.key]) {
        if (k) safeSend(() => sock.sendMessage(chatJid, { delete: k })).catch(() => {})
      }

      await safeSend(() => sock.sendMessage(chatJid, {
        text: [
          `✔ *Conectado como sub-bot*`,
          ``,
          ` Nombre:  *${name}*`,
          ` Número:  *+${phone}*`,
          ` Método:  *${method === 'code' ? 'Código' : 'QR'}*`,
          ``,
          `> § Para desconectarte escribe *#stopbot*`,
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

      // sesión inválida — borrar y notificar
      if (reason === 401 || reason === 405) {
        fs.rmSync(subPath, { recursive: true, force: true })
        subBots.delete(phone)
        await safeSend(() => sock.sendMessage(chatJid, {
          text: `✗ Sesión cerrada permanentemente\n§ Usa *#serbot* para reconectarte`,
        })).catch(() => {})
        return
      }

      // reemplazado por otra sesión
      if (reason === 440) {
        await safeSend(() => sock.sendMessage(chatJid, {
          text: `§ Tu sesión fue reemplazada por otro dispositivo\n§ Cierra WhatsApp Web y usa *#serbot* para reconectar`,
        })).catch(() => {})
        return
      }

      // reintentar automáticamente
      if (retries < MAX_RETRIES) {
        const delay = 1000 * Math.pow(2, retries)
        setTimeout(() => {
          codeSent = false
          startSubBot(phone, method, sock, chatJid, null, retries + 1).catch(() => {})
        }, delay)
      } else {
        await safeSend(() => sock.sendMessage(chatJid, {
          text: `✗ No se pudo reconectar después de ${MAX_RETRIES} intentos\n§ Usa *#serbot* para intentar de nuevo`,
        })).catch(() => {})
      }
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
      const meta    = JSON.parse(fs.readFileSync(path.join(getSubPath(phone), 'meta.json'), 'utf-8'))
      const method  = meta?.method  ?? 'qr'
      const chatJid = meta?.chatJid ?? `${phone}@s.whatsapp.net`
      await startSubBot(phone, method, mainSock, chatJid, null, 0)
    } catch {}
  }
}

// ─── Comando ──────────────────────────────────────────────────────────────────
const command: Command = {
  name:        'serbot',
  aliases:     ['jadibot', 'subbot'],
  description: 'Conviértete en sub-bot',
  category:    'general',
  groupOnly:   false,

  async execute({ sock, jid, msg, args, sender, isGroup }) {

    // solo en privado
    if (isGroup) {
      await safeSend(() => sock.sendMessage(jid, {
        text: `§ Este comando solo funciona en privado\n§ Escríbeme directamente`,
      }, { quoted: msg }))
      return
    }

    // extraer número del sender
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

    // ya conectado
    if (subBots.get(phone)?.status === 'connected') {
      await safeSend(() => sock.sendMessage(jid, {
        text: [
          `§ Ya estás conectado como sub-bot`,
          ``,
          `§ Para desconectarte: *#stopbot*`,
        ].join('\n'),
      }, { quoted: msg }))
      return
    }

    const method: 'qr' | 'code' = args[0]?.toLowerCase() === 'code' ? 'code' : 'qr'

    await safeSend(() => sock.sendMessage(jid, {
      text: method === 'code'
        ? `◈ Generando código de emparejamiento para *+${phone}*...`
        : `◈ Generando QR para *+${phone}*...`,
    }, { quoted: msg }))

    await startSubBot(phone, method, sock, jid, msg)
  },
}

export default command