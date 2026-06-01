import type { Command } from '../../../types/index.js'

const command: Command = {
  name: 'ping',
  aliases: ['p'],
  description: 'Verifica que el bot esté activo',
  category: 'general',
  cooldown: 3,

  async execute({ sock, jid, msg }) {
    const start = Date.now()
    await sock.sendMessage(jid, { text: '🏓 Calculando...' }, { quoted: msg })
    const ms = Date.now() - start
    await sock.sendMessage(jid, { text: `🏓 Pong! *${ms}ms*` })
  },
}

export default command