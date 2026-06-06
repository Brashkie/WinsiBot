import type { Command } from '../../../types/index.js'
import { getUserData } from '@core/events/index.js'
import { safeSend } from '@lib/media_sender.js'

const command: Command = {
  name:        'addexp',
  aliases:     ['delexp', 'addxp', 'delxp', 'darexp', 'quitarexp'],
  description: 'Añade o quita EXP a un usuario',
  category:    'owner',
  ownerOnly:   true,

  async execute({ sock, jid, msg, command: cmd, args }) {
    const isAdd    = cmd === 'addexp' || cmd === 'addxp' || cmd === 'darexp'
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

    if (!isAdd && user.exp < amount) {
      await safeSend(() => sock.sendMessage(jid, {
        text: `§ @${number} solo tiene ${user.exp} EXP`,
        mentions: [target],
      }, { quoted: msg }))
      return
    }

    user.exp = isAdd ? user.exp + amount : user.exp - amount

    await safeSend(() => sock.sendMessage(jid, {
      text: [
        isAdd ? `✔ *+${amount} EXP añadidos*` : `✔ *-${amount} EXP quitados*`,
        ``,
        `§ Usuario: @${number}`,
        `§ Total:   ${user.exp} EXP`,
      ].join('\n'),
      mentions: [target],
    }, { quoted: msg }))
  },
}

export default command
