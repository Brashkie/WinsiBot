import type { Command } from '../../../types/index.js'
import { safeSend } from '@lib/media_sender.js'

const command: Command = {
  name:        'block',
  aliases:     ['unblock', 'bloquear', 'desbloquear'],
  description: 'Bloquea o desbloquea un número',
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

    const isBlock = cmd === 'block' || cmd === 'bloquear'
    const number  = target.replace('@s.whatsapp.net', '').replace(/[^0-9]/g, '')

    await sock.updateBlockStatus(target, isBlock ? 'block' : 'unblock')

    await safeSend(() => sock.sendMessage(jid, {
      text:     isBlock ? `✔ @${number} bloqueado` : `✔ @${number} desbloqueado`,
      mentions: [target],
    }, { quoted: msg }))
  },
}

export default command
