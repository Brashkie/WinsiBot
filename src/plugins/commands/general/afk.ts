import type { Command } from '../../../types/index.js'
import { getUserData } from '@core/events/index.js'
import { safeSend } from '@lib/media_sender.js'

const command: Command = {
  name:        'afk',
  aliases:     ['ausente'],
  description: 'Activa el modo AFK con una razón',
  category:    'general',
  register:    true,
  cooldown:    10,

  async execute({ sock, jid, msg, sender, pushName, args }) {
    const reason = args.join(' ').trim()

    if (!reason) {
      await safeSend(() => sock.sendMessage(jid, {
        text: '§ Escribe una razón\nEjemplo: !afk durmiendo',
      }, { quoted: msg }))
      return
    }
    if (reason.length < 3) {
      await safeSend(() => sock.sendMessage(jid, {
        text: '§ La razón debe tener al menos 3 caracteres',
      }, { quoted: msg }))
      return
    }

    const user   = getUserData(sender, pushName)
    user.profile.afk       = Date.now()
    user.profile.afkReason = reason

    await safeSend(() => sock.sendMessage(jid, {
      text: [
        `ⴰ️ *AFK activado*`,
        ``,
        `§ @${sender.split('@')[0]} está ausente`,
        `§ Razón: _${reason}_`,
      ].join('\n'),
      mentions: [sender],
    }, { quoted: msg }))
  },
}

export default command
