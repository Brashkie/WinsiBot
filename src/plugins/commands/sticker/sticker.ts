import type { Command } from '../../../types/index.js'
import { downloadMediaMessage } from '@whiskeysockets/baileys'
import { getUserData } from '@core/events.js'
import { safeSend } from '@lib/media_sender.js'
import { stickerDe, cambiarMeta, metaDe, leerMeta } from '@lib/sticker.js'
import { tx } from '@lib/i18n.js'
import { logger } from '@core/logger.js'

// #sticker: una imagen o un video, enviados o citados, a sticker.
//
// `#sticker Mi pack | Yo` le pone pack y autor; sin nada, los tuyos (#setmeta)
// o los del bot. Citando un sticker, le cambia el pack y el autor sin volver a
// codificarlo (lo mismo que #take).
//
// Antes escribía el archivo a disco para que la librería lo leyera de vuelta,
// y separaba pack y autor por espacios: `#sticker Mi Pack` dejaba "Mi" de pack.

const T = {
  uso:   { es: '❌ Envía o cita una imagen, un video o un sticker con el comando.\n> `{p}sticker Mi pack | Yo` — con pack y autor', en: '❌ Send or quote an image, a video or a sticker with the command.\n> `{p}sticker My pack | Me` — with pack and author', pt: '❌ Envie ou cite uma imagem, um vídeo ou uma figurinha com o comando.\n> `{p}sticker Meu pack | Eu` — com pack e autor' },
  error: { es: '> No pude hacer el sticker.', en: '> I couldn\'t make the sticker.', pt: '> Não consegui fazer a figurinha.' },
}

const command: Command = {
  name: 'sticker',
  aliases: ['s', 'stiker'],
  description: 'Convierte imagen/video a sticker  |  !sticker [pack | autor]  ·  citando un sticker, le cambia pack y autor',
  category: 'sticker',
  cooldown: 3,

  async execute({ sock, jid, msg, args, sender, prefix, lang }) {
    const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage
    const target = quoted ?? msg.message
    const esSticker = !!target?.stickerMessage
    const esVideo = !!target?.videoMessage

    if (!target?.imageMessage && !esVideo && !esSticker) {
      await safeSend(() => sock.sendMessage(jid, { text: tx(lang, T.uso, { p: prefix }) }, { quoted: msg }))
      return
    }

    try {
      const media = await downloadMediaMessage({ ...msg, message: target } as any, 'buffer', {}) as Buffer
      const meta = leerMeta(args.join(' '), metaDe(getUserData(sender)))
      const sticker = esSticker
        ? await cambiarMeta(media, meta)
        : await stickerDe(media, { ...meta, animated: esVideo })
      await safeSend(() => sock.sendMessage(jid, { sticker }, { quoted: msg }))
    } catch (err) {
      logger.warn({ err }, 'sticker: no se pudo armar')
      await safeSend(() => sock.sendMessage(jid, { text: tx(lang, T.error) }, { quoted: msg }))
    }
  },
}

export default command
