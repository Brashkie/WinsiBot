import type { Command } from '../../../types/index.js'
import { downloadMediaMessage } from '@whiskeysockets/baileys'
import { safeSend } from '@lib/media_sender.js'
import { aMp4 } from '@lib/ffmpeg.js'
import { esAnimado } from '@lib/mime.js'
import { tx } from '@lib/i18n.js'
import { logger } from '@core/logger.js'

// #toimg: un sticker de vuelta a imagen (PNG, con su transparencia) o, si es
// animado, a video en bucle. El README lo listaba desde hace rato pero el
// comando no existía.
//
// Un animado va WebP → GIF con sharp (libvips lee las páginas del WebP) y de
// ahí a MP4: ffmpeg no decodifica bien el WebP animado, y un GIF suelto
// WhatsApp lo manda como archivo, no como algo que se reproduzca.

const T = {
  uso:   { es: '✗ Cita un sticker con `{p}toimg`.', en: '✗ Quote a sticker with `{p}toimg`.', pt: '✗ Cite uma figurinha com `{p}toimg`.' },
  error: { es: '> Ese sticker no se pudo convertir.', en: '> That sticker couldn\'t be converted.', pt: '> Não deu para converter essa figurinha.' },
}


const command: Command = {
  name:        'toimg',
  aliases:     ['toimage', 'aimagen', 'stickerimg'],
  description: 'Un sticker a imagen (o a video, si es animado), citándolo',
  category:    'sticker',
  cooldown:    5,

  async execute({ sock, jid, msg, prefix, lang }) {
    const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage
    if (!quoted?.stickerMessage) {
      await safeSend(() => sock.sendMessage(jid, { text: tx(lang, T.uso, { p: prefix }) }, { quoted: msg }))
      return
    }
    try {
      const webp = await downloadMediaMessage({ ...msg, message: quoted } as any, 'buffer', {}) as Buffer
      const sharp = (await import('sharp')).default
      if (esAnimado(webp)) {
        const gif = await sharp(webp, { animated: true }).gif().toBuffer()
        const video = await aMp4(gif, 'gif')
        await safeSend(() => sock.sendMessage(jid, { video, gifPlayback: true }, { quoted: msg }))
      } else {
        const image = await sharp(webp).png().toBuffer()
        await safeSend(() => sock.sendMessage(jid, { image }, { quoted: msg }))
      }
    } catch (err) {
      logger.warn({ err }, 'toimg: no se pudo convertir')
      await safeSend(() => sock.sendMessage(jid, { text: tx(lang, T.error) }, { quoted: msg }))
    }
  },
}

export default command
