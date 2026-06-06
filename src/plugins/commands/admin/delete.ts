import type { Command } from '../../../types/index.js'
import { safeSend } from '@lib/media_sender.js'

const command: Command = {
  name:        'delete',
  aliases:     ['del', 'borrar', 'eliminar'],
  description: 'Elimina el mensaje citado',
  category:    'admin',
  groupOnly:   true,
  adminOnly:   true,

  async execute({ sock, jid, msg }) {
    const ctx_info = msg.message?.extendedTextMessage?.contextInfo
    const quotedId = ctx_info?.stanzaId
    const quotedParticipant = ctx_info?.participant

    if (!quotedId) {
      await safeSend(() => sock.sendMessage(jid, {
        text: '§ Cita el mensaje que quieres eliminar',
      }, { quoted: msg }))
      return
    }

    await safeSend(() => sock.sendMessage(jid, {
      delete: {
        remoteJid: jid,
        fromMe:    false,
        id:        quotedId,
        ...(quotedParticipant != null && { participant: quotedParticipant }),
      },
    }))

    // También elimina el comando !delete para limpiar el chat
    await safeSend(() => sock.sendMessage(jid, {
      delete: msg.key,
    })).catch(() => {})
  },
}

export default command
