import type { Command } from '../../../types/index.js'
import { getUserData, patchUserData } from '@core/events.js'

const n = (jid: string) => jid.split('@')[0]!

function getTarget(msg: any): string | undefined {
  return (msg.message?.extendedTextMessage?.contextInfo?.mentionedJid ?? [])[0]
      ?? msg.message?.extendedTextMessage?.contextInfo?.participant
}

const command: Command = {
  name: 'rechazar',
  aliases: ['cancelar', 'decline'],
  description: 'Rechaza una propuesta de pareja (@mencionar a quien propuso)',
  category: 'rpg',
  groupOnly: true,

  async execute({ sock, jid, msg, sender, prefix }) {
    const target = getTarget(msg)
    if (!target) {
      await sock.sendMessage(jid, {
        text: `> Etiqueta a quien quieres rechazar.\n> Ej: \`${prefix}rechazar @usuario\``,
      }, { quoted: msg })
      return
    }

    if (target === sender) {
      await sock.sendMessage(jid, { text: '> No puedes rechazarte a ti mismo.' }, { quoted: msg })
      return
    }

    const them = getUserData(target)

    if (them.profile.marry !== sender) {
      await sock.sendMessage(jid, {
        text: `> @${n(target)} no te ha propuesto una relación.`,
        mentions: [target],
      }, { quoted: msg })
      return
    }

    patchUserData(target, { profile: { marry: '' } })

    const tName = them.name || n(target)
    await sock.sendMessage(jid, {
      text: `💔 *@${n(sender)}* ha rechazado la propuesta de *@${n(target)}*\n_Mala suerte, ${tName}._`,
      mentions: [sender, target],
    }, { quoted: msg })
  },
}

export default command
