import type { Command } from '../../../types/index.js'
import { getUserData } from '@core/events/index.js'
import { safeSend } from '@lib/media_sender.js'

const command: Command = {
  name:        'unban',
  aliases:     ['desbanear', 'unbanuser'],
  description: 'Desbanea a un usuario de la base de datos',
  category:    'owner',
  ownerOnly:   true,

  async execute({ sock, jid, msg, args }) {
    const ctx_info = msg.message?.extendedTextMessage?.contextInfo
    const target   = ctx_info?.mentionedJid?.[0]
      ?? ctx_info?.participant
      ?? (args[0]?.replace(/[@+]/g, '') + '@s.whatsapp.net')

    if (!target || target === '@s.whatsapp.net') {
      await safeSend(() => sock.sendMessage(jid, {
        text: '§ Menciona o cita al usuario a desbanear',
      }, { quoted: msg }))
      return
    }

    const number = target.replace('@s.whatsapp.net', '').replace(/[^0-9]/g, '')
    const user   = getUserData(target, '')

    if (!user.banned) {
      await safeSend(() => sock.sendMessage(jid, {
        text: `§ @${number} no está baneado`,
        mentions: [target],
      }, { quoted: msg }))
      return
    }

    user.banned    = false
    user.banReason = ''

    await safeSend(() => sock.sendMessage(jid, {
      text:     `✔ @${number} desbaneado`,
      mentions: [target],
    }, { quoted: msg }))
  },
}

export default command
