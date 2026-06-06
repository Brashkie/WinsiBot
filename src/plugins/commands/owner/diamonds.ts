import type { Command } from '../../../types/index.js'
import { getUserData } from '@core/events/index.js'
import { safeSend } from '@lib/media_sender.js'

const command: Command = {
  name:        'adddiamonds',
  aliases:     ['deldiamonds', 'dardiamantes', 'quitardiamantes'],
  description: 'Añade o quita diamantes a un usuario',
  category:    'owner',
  ownerOnly:   true,

  async execute({ sock, jid, msg, command: cmd, args }) {
    const isAdd    = cmd === 'adddiamonds' || cmd === 'dardiamantes'
    const ctx_info = msg.message?.extendedTextMessage?.contextInfo
    const target   = ctx_info?.mentionedJid?.[0]
      ?? ctx_info?.participant
      ?? (args[0]?.startsWith('@') ? args[0].replace('@', '') + '@s.whatsapp.net' : null)

    const amountArg = args.find(a => /^\d+$/.test(a))
    const amount    = amountArg ? parseInt(amountArg) : 0

    if (!target || amount < 1) {
      await safeSend(() => sock.sendMessage(jid, {
        text: `§ Uso: !${cmd} @usuario <cantidad>`,
      }, { quoted: msg }))
      return
    }

    const number = target.replace('@s.whatsapp.net', '').replace(/[^0-9]/g, '')
    const user   = getUserData(target, '')

    if (!isAdd && user.diamonds < amount) {
      await safeSend(() => sock.sendMessage(jid, {
        text: `§ @${number} solo tiene 💎 ${user.diamonds}`,
        mentions: [target],
      }, { quoted: msg }))
      return
    }

    user.diamonds = isAdd ? user.diamonds + amount : user.diamonds - amount

    await safeSend(() => sock.sendMessage(jid, {
      text: [
        isAdd ? `✔ *+💎 ${amount} añadidos*` : `✔ *-💎 ${amount} quitados*`,
        ``,
        `§ Usuario: @${number}`,
        `§ Total:   💎 ${user.diamonds}`,
      ].join('\n'),
      mentions: [target],
    }, { quoted: msg }))
  },
}

export default command
