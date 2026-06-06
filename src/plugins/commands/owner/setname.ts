import type { Command } from '../../../types/index.js'
import { safeSend } from '@lib/media_sender.js'

const command: Command = {
  name:        'setname',
  aliases:     ['setbotname', 'nombrar', 'nombre'],
  description: 'Cambia el nombre del bot en WhatsApp',
  category:    'owner',
  ownerOnly:   true,

  async execute({ sock, jid, msg, args }) {
    const name = args.join(' ').trim()

    if (!name) {
      await safeSend(() => sock.sendMessage(jid, {
        text: '§ Escribe el nuevo nombre\nEjemplo: !setname WinsiBot v2',
      }, { quoted: msg }))
      return
    }

    await sock.updateProfileName(name)

    await safeSend(() => sock.sendMessage(jid, {
      text: `✔ Nombre cambiado a: *${name}*`,
    }, { quoted: msg }))
  },
}

export default command
