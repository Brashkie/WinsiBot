import type { Command } from '../../../types/index.js'
import { safeSend }   from '@lib/media_sender.js'

const LINK_RE = /chat\.whatsapp\.com\/([0-9A-Za-z]{20,24})/i

const command: Command = {
  name:        'join',
  aliases:     ['joingroup', 'unirse', 'unete'],
  description: 'Une el bot a un grupo por link de invitación',
  category:    'owner',
  ownerOnly:   true,

  async execute({ sock, jid, msg, text }) {
    const raw   = text.trim() || ''
    const match = raw.match(LINK_RE)

    if (!match) {
      await safeSend(() => sock.sendMessage(jid, {
        text: [
          '§ Escribe o pega el link del grupo',
          'Ejemplo: !join https://chat.whatsapp.com/XXXXXXXXXXXXXXXXXXXXXX',
        ].join('\n'),
      }, { quoted: msg }))
      return
    }

    const code = match[1]!
    const groupId = await sock.groupAcceptInvite(code).catch((e: any) => {
      throw new Error(e?.message ?? 'No se pudo unir al grupo')
    })

    await safeSend(() => sock.sendMessage(jid, {
      text: [
        `✔ Me uní al grupo exitosamente`,
        `§ ID: \`${groupId}\``,
      ].join('\n'),
    }, { quoted: msg }))
  },
}

export default command
