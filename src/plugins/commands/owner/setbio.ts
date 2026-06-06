import type { Command } from '../../../types/index.js'
import { safeSend } from '@lib/media_sender.js'

const command: Command = {
  name:        'setbio',
  aliases:     ['setbiobot', 'bio', 'estado'],
  description: 'Cambia la bio/estado del bot en WhatsApp',
  category:    'owner',
  ownerOnly:   true,

  async execute({ sock, jid, msg, args }) {
    const bio = args.join(' ').trim()

    if (!bio) {
      await safeSend(() => sock.sendMessage(jid, {
        text: '§ Escribe la nueva bio\nEjemplo: !setbio Bot activo 24/7 🤖',
      }, { quoted: msg }))
      return
    }

    await sock.updateProfileStatus(bio)

    await safeSend(() => sock.sendMessage(jid, {
      text: `✔ Bio actualizada\n§ _${bio}_`,
    }, { quoted: msg }))
  },
}

export default command
