import type { Command } from '../../../types/index.js'
import { getUserData } from '@core/events/index.js'
import { safeSend } from '@lib/media_sender.js'

// !addpremium @user 7   → 7 días de premium
// !delpremium @user     → quita premium

const command: Command = {
  name:        'addpremium',
  aliases:     ['delpremium', 'quitarpremium', 'addvip', 'delvip'],
  description: 'Añade o quita premium a un usuario',
  category:    'owner',
  ownerOnly:   true,

  async execute({ sock, jid, msg, command: cmd, args }) {
    const isAdd    = cmd === 'addpremium' || cmd === 'addvip'
    const ctx_info = msg.message?.extendedTextMessage?.contextInfo
    const target   = ctx_info?.mentionedJid?.[0]
      ?? ctx_info?.participant
      ?? (args[0]?.startsWith('@') ? args[0].replace('@', '') + '@s.whatsapp.net' : null)

    if (!target) {
      await safeSend(() => sock.sendMessage(jid, {
        text: isAdd
          ? '§ Uso: !addpremium @usuario <días>\nEjemplo: !addpremium @usuario 30'
          : '§ Uso: !delpremium @usuario',
      }, { quoted: msg }))
      return
    }

    const number = target.replace('@s.whatsapp.net', '').replace(/[^0-9]/g, '')
    const user   = getUserData(target, '')

    if (isAdd) {
      const daysArg = args.find(a => /^\d+$/.test(a))
      const days    = daysArg ? parseInt(daysArg) : 30

      if (days < 1 || days > 3650) {
        await safeSend(() => sock.sendMessage(jid, {
          text: '§ Los días deben ser entre 1 y 3650',
        }, { quoted: msg }))
        return
      }

      const ms   = days * 86_400_000
      const now  = Date.now()
      user.premiumTime = user.premiumTime > now ? user.premiumTime + ms : now + ms
      user.premium     = true

      const expiry = new Date(user.premiumTime).toLocaleDateString('es-PE')

      await safeSend(() => sock.sendMessage(jid, {
        text: [
          `★ *Premium activado*`,
          ``,
          `§ Usuario: @${number}`,
          `§ Días:    ${days}`,
          `§ Expira:  ${expiry}`,
        ].join('\n'),
        mentions: [target],
      }, { quoted: msg }))
    } else {
      if (!user.premium) {
        await safeSend(() => sock.sendMessage(jid, {
          text: `§ @${number} no tiene premium`,
          mentions: [target],
        }, { quoted: msg }))
        return
      }
      user.premium     = false
      user.premiumTime = 0

      await safeSend(() => sock.sendMessage(jid, {
        text:     `§ Premium removido de @${number}`,
        mentions: [target],
      }, { quoted: msg }))
    }
  },
}

export default command
