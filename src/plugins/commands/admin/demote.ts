import type { Command } from '../../../types/index.js'
import { safeSend } from '@lib/media_sender.js'

const command: Command = {
  name:        'demote',
  aliases:     ['quitaradmin', 'desadmin'],
  description: 'Quita el rol de administrador a un miembro',
  category:    'admin',
  groupOnly:   true,
  adminOnly:   true,

  async execute({ sock, jid, msg, args }) {
    const ctx_info = msg.message?.extendedTextMessage?.contextInfo
    const target   = ctx_info?.mentionedJid?.[0]
      ?? ctx_info?.participant
      ?? (args[0] ? args[0].replace(/[@+]/g, '') + '@s.whatsapp.net' : null)

    if (!target) {
      await safeSend(() => sock.sendMessage(jid, {
        text: '§ Menciona o cita al admin que quieres degradar',
      }, { quoted: msg }))
      return
    }

    const number = target.replace('@s.whatsapp.net', '').replace('@lid', '').replace(/[^0-9]/g, '')

    await sock.groupParticipantsUpdate(jid, [target], 'demote')

    await safeSend(() => sock.sendMessage(jid, {
      text:     `§ @${number} ya no es administrador`,
      mentions: [target],
    }, { quoted: msg }))
  },
}

export default command
