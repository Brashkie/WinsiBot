import type { Command } from '../../../types/index.js'
import { getUserData, patchUserData } from '@core/events.js'

const n = (jid: string) => jid.split('@')[0]!

const command: Command = {
  name: 'terminar',
  aliases: ['cortar', 'romper', 'finish'],
  description: 'Termina tu relación o cancela una propuesta pendiente',
  category: 'rpg',
  groupOnly: true,

  async execute({ sock, jid, msg, sender, pushName }) {
    const me    = getUserData(sender, pushName)
    const marry = me.profile.marry

    if (!marry) {
      await sock.sendMessage(jid, {
        text: '> No tienes ninguna relación ni propuesta activa.',
      }, { quoted: msg })
      return
    }

    const them      = getUserData(marry)
    const confirmed = them.profile.marry === sender
    const meName    = me.name || pushName
    const tName     = them.name || n(marry)

    patchUserData(sender, { profile: { marry: '' } })
    if (confirmed) patchUserData(marry, { profile: { marry: '' } })

    if (confirmed) {
      await sock.sendMessage(jid, {
        text: `💔 *@${n(sender)}* ha terminado la relación con *@${n(marry)}*\n_${meName} y ${tName} ya no son pareja._`,
        mentions: [sender, marry],
      }, { quoted: msg })
    } else {
      await sock.sendMessage(jid, {
        text: `❌ *@${n(sender)}* canceló la propuesta a *@${n(marry)}*`,
        mentions: [sender, marry],
      }, { quoted: msg })
    }
  },
}

export default command
