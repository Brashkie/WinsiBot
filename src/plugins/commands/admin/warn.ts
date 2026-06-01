import type { Command } from '../../../types/index.js'
import { warnUser } from '@lib/pythonBridge.js'

const MAX_WARNS = 3

const command: Command = {
  name: 'warn',
  aliases: ['advertir'],
  description: 'Advierte a un usuario',
  category: 'admin',
  groupOnly: true,
  adminOnly: true,

  async execute({ sock, jid, msg, args }) {
    const quoted = msg.message?.extendedTextMessage?.contextInfo
    const target = quoted?.participant
      ?? args[0]?.replace('@', '') + '@s.whatsapp.net'

    if (!target) {
      await sock.sendMessage(jid, { text: '❌ Menciona o cita a alguien.' }, { quoted: msg })
      return
    }

    const warns = await warnUser(target)
    const number = target.replace('@s.whatsapp.net', '')

    if (warns >= MAX_WARNS) {
      await sock.sendMessage(jid, {
        text: `⚠️ @${number} ha alcanzado *${warns}/${MAX_WARNS}* advertencias.\n🚫 Será expulsado.`,
        mentions: [target],
      }, { quoted: msg })

      // kick del grupo
      await sock.groupParticipantsUpdate(jid, [target], 'remove')
      return
    }

    await sock.sendMessage(jid, {
      text: `⚠️ @${number} advertido.\n📊 Advertencias: *${warns}/${MAX_WARNS}*`,
      mentions: [target],
    }, { quoted: msg })
  },
}

export default command