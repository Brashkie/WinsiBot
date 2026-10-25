import type { Command } from '../../../types/index.js'
import { safeSend } from '@lib/media_sender.js'
import { tx } from '@lib/i18n.js'

// #getpic: la foto de perfil de alguien (mencionado, citado, o la tuya), en
// grande. WhatsApp no la da si la persona la tiene oculta para quien pregunta.

const T = {
  oculta: { es: '> @{n} no tiene foto de perfil, o no la deja ver.', en: '> @{n} has no profile picture, or doesn\'t let it be seen.', pt: '> @{n} não tem foto de perfil, ou não deixa ver.' },
  foto:   { es: '🖼️ Foto de perfil de @{n}', en: '🖼️ Profile picture of @{n}', pt: '🖼️ Foto de perfil de @{n}' },
}

const command: Command = {
  name:        'getpic',
  aliases:     ['pfp', 'fotoperfil', 'verfoto'],
  description: 'La foto de perfil de alguien  |  !getpic @alguien (o citando su mensaje)',
  category:    'util',
  cooldown:    5,

  async execute({ sock, jid, msg, sender, lang }) {
    const info = msg.message?.extendedTextMessage?.contextInfo
    const quien = info?.mentionedJid?.[0] ?? info?.participant ?? sender
    const n = quien.split('@')[0]
    let url: string | undefined
    try {
      // 'image' es la grande; sin el segundo argumento WhatsApp da la miniatura.
      url = await sock.profilePictureUrl(quien, 'image')
    } catch { /* oculta o sin foto */ }
    if (!url) {
      await safeSend(() => sock.sendMessage(jid, { text: tx(lang, T.oculta, { n }), mentions: [quien] }, { quoted: msg }))
      return
    }
    await safeSend(() => sock.sendMessage(jid, { image: { url }, caption: tx(lang, T.foto, { n }), mentions: [quien] }, { quoted: msg }))
  },
}

export default command
