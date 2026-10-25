import type { Command } from '../../../types/index.js'
import { safeSend } from '@lib/media_sender.js'
import { destinoDe, resultadoDe } from '@lib/targets.js'

const command: Command = {
  name:        'promote',
  aliases:     ['daradmin', 'promover', 'haceradmin'],
  description: 'Da el rol de administrador a un miembro  |  !promote @usuario',
  category:    'admin',
  groupOnly:   true,
  adminOnly:   true,

  async execute({ sock, jid, msg, args, isBotAdmin }) {
    const responder = (text: string, mentions: string[] = []) =>
      safeSend(() => sock.sendMessage(jid, { text, mentions }, { quoted: msg }))
    if (!isBotAdmin) { await responder('§ Necesito ser admin del grupo para dar admin'); return }
    const target = destinoDe(msg, args)
    if (!target) { await responder('§ Menciona o cita a quien quieres hacer admin'); return }
    try {
      const r = await sock.groupParticipantsUpdate(jid, [target], 'promote')
      const status = resultadoDe(r)
      if (status && status !== '200') { await responder(`§ WhatsApp no lo dejó (código ${status})`); return }
      await responder(`§ @${target.split('@')[0]} ahora es administrador`, [target])
    } catch {
      await responder('§ No se pudo: ¿sigue en el grupo?')
    }
  },
}

export default command
