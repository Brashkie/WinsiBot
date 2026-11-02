import type { Command } from '../../../types/index.js'
import { getUserData } from '@core/events/index.js'
import { safeSend } from '@lib/media_sender.js'

const command: Command = {
  name:        'afk',
  aliases:     ['ausente'],
  description: 'Activa el modo AFK con una razón',
  category:    'general',
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

    // Las menciones de la razón, para que al repetirla se vea el nombre y no
    // el número (ver afkMenciones en core/events).
    const menciones = (msg.message?.extendedTextMessage?.contextInfo?.mentionedJid ?? [])
      .filter((j) => reason.includes(`@${j.split('@')[0]}`))

    const user   = getUserData(sender, pushName)
    user.profile.afk       = Date.now()
    user.profile.afkReason = reason
    if (menciones.length) user.profile.afkMenciones = menciones
    else delete user.profile.afkMenciones

    await safeSend(() => sock.sendMessage(jid, {
      text: [
        `ⴰ️ *AFK activado*`,
        ``,
        `§ @${sender.split('@')[0]} está ausente`,
        `§ Razón: _${reason}_`,
      ].join('\n'),
      mentions: [sender, ...menciones],
    }, { quoted: msg }))
  },
}

export default command
