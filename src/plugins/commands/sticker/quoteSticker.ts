import type { Command } from '../../../types/index.js'
import axios from 'axios'
import { safeSend } from '@lib/media_sender.js'
import { winsiStore } from '@core/store.js'
import { logger } from '@core/logger.js'
import { cita } from '@lib/textImage.js'
import { stickerDeImagen, metaDe } from '@lib/sticker.js'
import { getUserData } from '@core/events.js'

// #qc: un mensaje convertido en sticker, con el nombre y la foto de quien lo
// escribió (ver textImage.ts).

const MAX = 300

/** La foto de perfil chica (64x64), o null si no tiene o no se puede bajar. */
async function avatar(sock: any, jid: string): Promise<Buffer | null> {
  try {
    const url = await sock.profilePictureUrl(jid, 'image')
    if (!url) return null
    const r = await axios.get<ArrayBuffer>(url, { responseType: 'arraybuffer', timeout: 8_000 })
    const sharp = (await import('sharp')).default
    return await sharp(Buffer.from(r.data)).resize(64, 64).jpeg({ quality: 80 }).toBuffer()
  } catch {
    return null
  }
}

const command: Command = {
  name:        'qc',
  aliases:     ['quotesticker', 'citar', 'quote-sticker'],
  description: 'Convierte un mensaje en sticker  |  responde a un mensaje con !qc  ·  !qc <texto>',
  category:    'sticker',
  cooldown:    8,

  async execute({ sock, jid, msg, sender, pushName, args, prefix }) {
    const ctx = msg.message?.extendedTextMessage?.contextInfo
    const citado = ctx?.quotedMessage as any
    const deCita = citado?.conversation ?? citado?.extendedTextMessage?.text ?? citado?.imageMessage?.caption ?? ''
    // Con texto escrito, la cita es del que escribe; respondiendo, del autor original.
    const texto = (args.join(' ') || deCita).trim().slice(0, MAX)
    const autor = args.length || !ctx?.participant ? sender : ctx.participant
    if (!texto) {
      await safeSend(() => sock.sendMessage(jid, { text: `💬 Responde a un mensaje con \`${prefix}qc\`, o \`${prefix}qc <texto>\`` }, { quoted: msg }))
      return
    }
    const nombre = autor === sender && pushName ? pushName : winsiStore.getName(autor)
    try {
      const sticker = await stickerDeImagen(await cita(nombre, texto, await avatar(sock, autor)), metaDe(getUserData(sender)))
      await safeSend(() => sock.sendMessage(jid, { sticker }, { quoted: msg }))
    } catch (err) {
      logger.warn({ err }, 'qc: no se pudo armar el sticker')
      await safeSend(() => sock.sendMessage(jid, { text: `> No pude armar el sticker ahora.` }, { quoted: msg }))
    }
  },
}

export default command
