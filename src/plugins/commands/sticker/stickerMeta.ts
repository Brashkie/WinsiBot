import type { Command } from '../../../types/index.js'
import { getUserData } from '@core/events.js'
import { safeSend } from '@lib/media_sender.js'
import { leerMeta, metaDe, META_POR_DEFECTO } from '@lib/sticker.js'
import { tx } from '@lib/i18n.js'

// #setmeta / #delmeta: el pack y el autor que llevan tus stickers (#sticker,
// #take, #qc, #texto) cuando no escribís otros.

const T = {
  actual: { es: '🏷️ Tus stickers salen con:\n> Pack: *{pack}*\n> Autor: *{author}*\n\n`{p}setmeta Mi pack | Yo` · `{p}delmeta`', en: '🏷️ Your stickers come out with:\n> Pack: *{pack}*\n> Author: *{author}*\n\n`{p}setmeta My pack | Me` · `{p}delmeta`', pt: '🏷️ Suas figurinhas saem com:\n> Pack: *{pack}*\n> Autor: *{author}*\n\n`{p}setmeta Meu pack | Eu` · `{p}delmeta`' },
  listo:  { es: '✅ Listo: tus stickers van a decir *{pack}* · *{author}*.', en: '✅ Done: your stickers will say *{pack}* · *{author}*.', pt: '✅ Pronto: suas figurinhas vão dizer *{pack}* · *{author}*.' },
  borrado: { es: '✅ Tus stickers vuelven a salir con los del bot (*{pack}* · *{author}*).', en: '✅ Your stickers are back to the bot\'s (*{pack}* · *{author}*).', pt: '✅ Suas figurinhas voltam a sair com os do bot (*{pack}* · *{author}*).' },
}

const setmeta: Command = {
  name:        'setmeta',
  aliases:     ['setstickermeta', 'stickermeta', 'mimeta'],
  description: 'El pack y autor de tus stickers  |  !setmeta Mi pack | Yo',
  category:    'sticker',
  cooldown:    3,

  async execute({ sock, jid, msg, args, sender, prefix, lang }) {
    const u = getUserData(sender)
    const texto = args.join(' ').trim()
    if (!texto) {
      await safeSend(() => sock.sendMessage(jid, { text: tx(lang, T.actual, { ...metaDe(u), p: prefix }) }, { quoted: msg }))
      return
    }
    u.stickerMeta = leerMeta(texto, metaDe(u))
    await safeSend(() => sock.sendMessage(jid, { text: tx(lang, T.listo, u.stickerMeta) }, { quoted: msg }))
  },
}

const delmeta: Command = {
  name:        'delmeta',
  aliases:     ['delstickermeta', 'resetmeta'],
  description: 'Tus stickers vuelven al pack y autor del bot',
  category:    'sticker',
  cooldown:    3,

  async execute({ sock, jid, msg, sender, lang }) {
    delete getUserData(sender).stickerMeta
    await safeSend(() => sock.sendMessage(jid, { text: tx(lang, T.borrado, META_POR_DEFECTO()) }, { quoted: msg }))
  },
}

export default [setmeta, delmeta]
