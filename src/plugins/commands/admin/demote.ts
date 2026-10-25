import type { Command } from '../../../types/index.js'
import { safeSend } from '@lib/media_sender.js'
import { destinoDe, resultadoDe } from '@lib/targets.js'

const command: Command = {
  name:        'demote',
  aliases:     ['quitaradmin', 'desadmin'],
  description: 'Quita el rol de administrador a un miembro',
  category:    'admin',
  groupOnly:   true,
  adminOnly:   true,

  async execute({ sock, jid, msg, args, isBotAdmin }) {
    const responder = (text: string, mentions: string[] = []) =>
      safeSend(() => sock.sendMessage(jid, { text, mentions }, { quoted: msg }))
    // Antes no lo miraba: sin ser admin, la llamada fallaba y el error no se
    // atrapaba.
    if (!isBotAdmin) { await responder('§ Necesito ser admin del grupo para quitar admin'); return }
    const target = destinoDe(msg, args)
    if (!target) { await responder('§ Menciona o cita al admin que quieres degradar'); return }
    try {
      const r = await sock.groupParticipantsUpdate(jid, [target], 'demote')
      const status = resultadoDe(r)
      if (status && status !== '200') { await responder(`§ WhatsApp no lo dejó (código ${status})`); return }
      await responder(`§ @${target.split('@')[0]} ya no es administrador`, [target])
    } catch {
      await responder('§ No se pudo: ¿sigue en el grupo, o es el creador?')
    }
  },
}

export default command
