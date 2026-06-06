import type { Command } from '../../../types/index.js'
import { userData, getUserData } from '@core/events/index.js'
import { safeSend } from '@lib/media_sender.js'

const command: Command = {
  name:        'resetuser',
  aliases:     ['resetdata', 'borrardatos', 'restablecerdatos'],
  description: 'Reinicia todos los datos de un usuario',
  category:    'owner',
  ownerOnly:   true,

  async execute({ sock, jid, msg, args }) {
    const ctx    = msg.message?.extendedTextMessage?.contextInfo
    const target = ctx?.mentionedJid?.[0]
      ?? ctx?.participant
      ?? (args[0]?.replace(/[@+]/g, '') + '@s.whatsapp.net')

    if (!target || target === '@s.whatsapp.net') {
      await safeSend(() => sock.sendMessage(jid, {
        text: '§ Menciona o cita al usuario a reiniciar',
      }, { quoted: msg }))
      return
    }

    const number = target.split('@')[0]

    // eliminar del Map — próxima interacción lo recreará con valores por defecto
    userData.delete(target)

    await safeSend(() => sock.sendMessage(jid, {
      text:     `✔ Datos de @${number} reiniciados`,
      mentions: [target],
    }, { quoted: msg }))
  },
}

export default command
