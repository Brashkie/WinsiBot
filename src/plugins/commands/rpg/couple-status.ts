import type { Command } from '../../../types/index.js'
import { getUserData, patchUserData } from '@core/events.js'

const n = (jid: string) => jid.split('@')[0]!

const command: Command = {
  name: 'mipareja',
  aliases: ['miamor', 'mylove', 'sinceridad', 'minovio', 'minovia'],
  description: 'Ver el estado de tu relación actual',
  category: 'rpg',
  groupOnly: true,

  async execute({ sock, jid, msg, sender, pushName, prefix }) {
    const me    = getUserData(sender, pushName)
    const marry = me.profile.marry

    if (!marry) {
      await sock.sendMessage(jid, {
        text: `> No tienes pareja actualmente.\n> Usa \`${prefix}pareja @usuario\` para proponer una relación.`,
      }, { quoted: msg })
      return
    }

    const them      = getUserData(marry)
    const confirmed = them.profile.marry === sender

    if (confirmed) {
      const tName = them.name || n(marry)
      await sock.sendMessage(jid, {
        text: `💑 *Tu pareja es @${n(marry)}*\n_${tName}_`,
        mentions: [marry],
      }, { quoted: msg })
      return
    }

    // Propuesta pendiente sin respuesta — limpiar
    const tName = them.name || n(marry)
    patchUserData(sender, { profile: { marry: '' } })
    await sock.sendMessage(jid, {
      text: `⌛ Tenías una propuesta pendiente con *${tName}*, pero no hubo respuesta.\n_La solicitud fue cancelada automáticamente._`,
      mentions: [marry],
    }, { quoted: msg })
  },
}

export default command
