import type { Command } from '../../../types/index.js'

const command: Command = {
  name: 'kick',
  aliases: ['expulsar'],
  description: 'Expulsa a un usuario del grupo',
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

    const number = target.replace('@s.whatsapp.net', '')

    await sock.sendMessage(jid, {
      text: `👢 @${number} fue expulsado del grupo.`,
      mentions: [target],
    }, { quoted: msg })

    await sock.groupParticipantsUpdate(jid, [target], 'remove')
  },
}

export default command