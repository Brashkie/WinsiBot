import type { Command } from '../../../types/index.js'
import { safeSend } from '@lib/media_sender.js'
import { logger } from '@core/logger.js'
import { textoGrande } from '@lib/textImage.js'
import { stickerDeImagen, metaDe } from '@lib/sticker.js'
import { getUserData } from '@core/events.js'

// #texto: un sticker con texto grande y borde (ver textImage.ts).

const MAX = 120

const command: Command = {
  name:        'texto',
  aliases:     ['ttp', 'textsticker', 'stickertexto'],
  description: 'Un sticker con tu texto en grande  |  !texto <texto>',
  category:    'sticker',
  cooldown:    5,

  async execute({ sock, jid, msg, args, prefix, sender }) {
    const citado = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage as any
    const texto = (args.join(' ') || citado?.conversation || citado?.extendedTextMessage?.text || '').trim()
    if (!texto) {
      await safeSend(() => sock.sendMessage(jid, { text: `🔤 \`${prefix}texto <lo que quieras>\` (hasta ${MAX} caracteres)` }, { quoted: msg }))
      return
    }
    try {
      const sticker = await stickerDeImagen(await textoGrande(texto.slice(0, MAX)), metaDe(getUserData(sender)))
      await safeSend(() => sock.sendMessage(jid, { sticker }, { quoted: msg }))
    } catch (err) {
      logger.warn({ err }, 'texto: no se pudo armar el sticker')
      await safeSend(() => sock.sendMessage(jid, { text: `> No pude armar el sticker ahora.` }, { quoted: msg }))
    }
  },
}

export default command
