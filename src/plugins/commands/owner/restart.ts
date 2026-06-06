import type { Command } from '../../../types/index.js'

const command: Command = {
  name:        'restart',
  aliases:     ['reiniciar', 'reboot', 'reset'],
  description: 'Reinicia el bot (requiere PM2 o nodemon)',
  category:    'owner',
  ownerOnly:   true,

  async execute({ sock, jid, msg }) {
    const sent = await sock.sendMessage(jid, {
      text: '◈ Preparando reinicio...',
    }, { quoted: msg })
    const key = sent?.key

    const frames = [
      '◈◈ Guardando estado...',
      '◈◈◈ Cerrando conexión...',
      '◉ Reiniciando bot...',
    ]

    for (const frame of frames) {
      await new Promise(r => setTimeout(r, 700))
      await sock.sendMessage(jid, { text: frame, edit: key } as any).catch(() => {})
    }

    await new Promise(r => setTimeout(r, 400))
    process.exit(0)
  },
}

export default command
