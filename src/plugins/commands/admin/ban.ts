import type { Command } from '../../../types/index.js'
import { warnUser, getOrCreateUser } from '@lib/pythonBridge.js'
import { pythonPost } from '@lib/pythonBridge.js'

const command: Command = {
  name: 'ban',
  aliases: ['banear'],
  description: 'Banea a un usuario del bot',
  category: 'admin',
  ownerOnly: true,

  async execute({ sock, jid, msg, args }) {
    const quoted = msg.message?.extendedTextMessage?.contextInfo
    const target = quoted?.participant
      ?? args[0]?.replace('@', '') + '@s.whatsapp.net'

    if (!target) {
      await sock.sendMessage(jid, { text: '❌ Menciona o cita a alguien.' }, { quoted: msg })
      return
    }

    await pythonPost(`/api/v1/users/${encodeURIComponent(target)}/ban`, {})
    await sock.sendMessage(jid, {
      text: `🚫 Usuario @${target.replace('@s.whatsapp.net', '')} baneado.`,
      mentions: [target],
    }, { quoted: msg })
  },
}

export default command