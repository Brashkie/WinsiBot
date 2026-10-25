import type { Command } from '../../../types/index.js'
import { downloadMediaMessage } from '@whiskeysockets/baileys'
import { getUserData } from '@core/events.js'
import { safeSend } from '@lib/media_sender.js'
import { cambiarMeta, metaDe, leerMeta } from '@lib/sticker.js'
import { tx } from '@lib/i18n.js'

// #take: le pone tu pack y autor a un sticker de otro, citándolo. Solo
// reescribe el EXIF (ver cambiarMeta): no recodifica, así que un animado sigue
// animado y nada pierde calidad.

const T = {
  uso: { es: '✗ Cita un sticker con `{p}take [pack | autor]`.', en: '✗ Quote a sticker with `{p}take [pack | author]`.', pt: '✗ Cite uma figurinha com `{p}take [pack | autor]`.' },
  error: { es: '> Ese sticker no se pudo leer.', en: '> That sticker couldn\'t be read.', pt: '> Não deu para ler essa figurinha.' },
}

const command: Command = {
  name:        'take',
  aliases:     ['wm', 'tomar', 'renombrarsticker'],
  description: 'Le pone tu pack y autor a un sticker, citándolo  |  !take [pack | autor]',
  category:    'sticker',
  cooldown:    3,

  async execute({ sock, jid, msg, args, sender, prefix, lang }) {
    const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage
    if (!quoted?.stickerMessage) {
      await safeSend(() => sock.sendMessage(jid, { text: tx(lang, T.uso, { p: prefix }) }, { quoted: msg }))
      return
    }
    try {
      const webp = await downloadMediaMessage({ ...msg, message: quoted } as any, 'buffer', {}) as Buffer
      const meta = leerMeta(args.join(' '), metaDe(getUserData(sender)))
      const sticker = await cambiarMeta(webp, meta)
      await safeSend(() => sock.sendMessage(jid, { sticker }, { quoted: msg }))
    } catch {
      await safeSend(() => sock.sendMessage(jid, { text: tx(lang, T.error) }, { quoted: msg }))
    }
  },
}

export default command
