import type { Command } from '../../../types/index.js'
import { sendWithMedia } from '@lib/media_sender.js'

const command: Command = {
  name: 'ping',
  aliases: ['p'],
  description: 'Verifica que el bot esté activo',
  category: 'general',
  cooldown: 3,

  async execute({ sock, jid, msg }) {
    // Latencia real: desde que WhatsApp marcó el mensaje hasta que el bot responde
    const sentAt = Number(msg.messageTimestamp ?? 0) * 1000
    const ms      = Date.now() - sentAt

    const text = [
      `🏓 *Pong!* ${ms}ms`,
      ``,
      `_WinsiBot está activo y respondiendo_`,
    ].join('\n')

    await sendWithMedia(sock, jid, text, 'WinsiBot', msg)
  },
}

export default command