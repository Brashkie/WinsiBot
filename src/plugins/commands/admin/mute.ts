import type { Command } from '../../../types/index.js'
import { updateGroup, getOrCreateGroup } from '@lib/pythonBridge.js'

const command: Command = {
  name: 'mute',
  aliases: ['silenciar', 'unmute'],
  description: 'Silencia o activa el bot en el grupo',
  category: 'admin',
  groupOnly: true,
  adminOnly: true,

  async execute({ sock, jid, msg, command: cmd }) {
    const mute = cmd === 'mute' || cmd === 'silenciar'

    await updateGroup({ jid, muted: mute })

    await sock.sendMessage(jid, {
      text: mute
        ? '🔇 Bot silenciado en este grupo.'
        : '🔊 Bot activado en este grupo.',
    }, { quoted: msg })
  },
}

export default command