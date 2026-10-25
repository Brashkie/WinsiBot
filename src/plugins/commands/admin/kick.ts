import type { Command } from '../../../types/index.js'
import { safeSend } from '@lib/media_sender.js'
import { destinoDe, resultadoDe } from '@lib/targets.js'

// Antes: ignoraba las menciones, sin argumentos intentaba sacar a
// "undefined@s.whatsapp.net", y anunciaba la expulsión ANTES de hacerla, así
// que si WhatsApp la rechazaba el mensaje decía algo que no pasó.

const command: Command = {
  name: 'kick',
  aliases: ['expulsar'],
  description: 'Expulsa a un usuario del grupo',
  category: 'admin',
  groupOnly: true,
  adminOnly: true,

  async execute({ sock, jid, msg, args, sender, isBotAdmin }) {
    const responder = (text: string, mentions: string[] = []) =>
      safeSend(() => sock.sendMessage(jid, { text, mentions }, { quoted: msg }))
    if (!isBotAdmin) { await responder('❌ Necesito ser admin del grupo para expulsar.'); return }
    const target = destinoDe(msg, args)
    if (!target) { await responder('❌ Menciona o cita a alguien.'); return }
    if (target === sender) { await responder('❌ No te puedes expulsar a ti mismo.'); return }
    try {
      const r = await sock.groupParticipantsUpdate(jid, [target], 'remove')
      const status = resultadoDe(r)
      if (status && status !== '200') { await responder(`❌ WhatsApp no lo dejó (código ${status}).`); return }
      await responder(`👢 @${target.split('@')[0]} fue expulsado del grupo.`, [target])
    } catch {
      await responder('❌ No se pudo: ¿sigue en el grupo, o es el creador?')
    }
  },
}

export default command
