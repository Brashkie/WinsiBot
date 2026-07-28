import { getUserData } from '@core/events/index.js'
import { getNumber } from '@lib/jid_utils.js'
import { safeSend } from '@lib/media_sender.js'
import type { Command } from '../../../types/index.js'

const command: Command = {
  name: 'ban',
  aliases: ['banear'],
  description: 'Banea a un usuario del bot',
  category: 'admin',
  ownerOnly: true,

  async execute({ sock, jid, msg, args }) {
    const quoted = msg.message?.extendedTextMessage?.contextInfo
    const mentioned = quoted?.mentionedJid?.[0] ?? quoted?.participant
    // Si no hay mención/cita, el target viene del primer argumento de texto
    // (!ban @usuario razón) — el resto de args, después de ese, es la razón.
    const target =
      mentioned ?? (args[0]?.startsWith('@') ? args[0].replace('@', '') + '@s.whatsapp.net' : null)
    const reason = (mentioned ? args : args.slice(1)).join(' ').trim()

    if (!target) {
      await safeSend(() =>
        sock.sendMessage(
          jid,
          {
            text: '§ Menciona o cita a alguien.',
          },
          { quoted: msg },
        ),
      )
      return
    }

    const number = getNumber(target)
    const user = getUserData(target, '')

    user.banned = true
    user.banReason = reason || 'Sin especificar'

    await safeSend(() =>
      sock.sendMessage(
        jid,
        {
          text: `✔ @${number} baneado${reason ? `\n§ Motivo: ${reason}` : ''}`,
          mentions: [target],
        },
        { quoted: msg },
      ),
    )
  },
}

export default command
