import type { Command } from '../../../types/index.js'
import { config } from '@config'
import { safeSend } from '@lib/media_sender.js'

// !addowner @user  → agrega owner en runtime (hasta reinicio)
// !delowner @user  → remueve owner en runtime

const command: Command = {
  name:        'addowner',
  aliases:     ['delowner'],
  description: 'Agrega o remueve un owner (runtime)',
  category:    'owner',
  ownerOnly:   true,

  async execute({ sock, jid, msg, command: cmd, args }) {
    const ctx_info = msg.message?.extendedTextMessage?.contextInfo
    const target   = ctx_info?.mentionedJid?.[0]
      ?? ctx_info?.participant
      ?? (args[0]?.replace(/[@+]/g, '') + '@s.whatsapp.net')

    if (!target || target === '@s.whatsapp.net') {
      await safeSend(() => sock.sendMessage(jid, {
        text: `§ Uso: !${cmd} @usuario`,
      }, { quoted: msg }))
      return
    }

    const number = target.replace('@s.whatsapp.net', '').replace(/[^0-9]/g, '')
    const owners = config.ownerJid as string[]

    if (cmd === 'addowner') {
      if (owners.includes(target)) {
        await safeSend(() => sock.sendMessage(jid, {
          text: `§ @${number} ya es owner`,
          mentions: [target],
        }, { quoted: msg }))
        return
      }
      owners.push(target)
      await safeSend(() => sock.sendMessage(jid, {
        text:     `✔ @${number} ahora es owner (hasta reinicio)`,
        mentions: [target],
      }, { quoted: msg }))
    } else {
      const idx = owners.indexOf(target)
      if (idx === -1) {
        await safeSend(() => sock.sendMessage(jid, {
          text: `§ @${number} no es owner`,
          mentions: [target],
        }, { quoted: msg }))
        return
      }
      owners.splice(idx, 1)
      await safeSend(() => sock.sendMessage(jid, {
        text:     `✔ @${number} removido de owners`,
        mentions: [target],
      }, { quoted: msg }))
    }
  },
}

export default command
