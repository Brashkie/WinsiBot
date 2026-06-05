import type { Command } from '../../../types/index.js'
import { getUserData, patchUserData } from '@core/events.js'

const n = (jid: string) => jid.split('@')[0]!

function getTarget(msg: any): string | undefined {
  return (msg.message?.extendedTextMessage?.contextInfo?.mentionedJid ?? [])[0]
      ?? msg.message?.extendedTextMessage?.contextInfo?.participant
}

const command: Command = {
  name: 'aceptar',
  aliases: ['acepto', 'accept'],
  description: 'Acepta una propuesta de pareja (@mencionar a quien propuso)',
  category: 'rpg',
  groupOnly: true,

  async execute({ sock, jid, msg, sender, pushName, prefix }) {
    const target = getTarget(msg)
    if (!target) {
      await sock.sendMessage(jid, {
        text: `> Etiqueta a quien quieres aceptar.\n> Ej: \`${prefix}aceptar @usuario\``,
      }, { quoted: msg })
      return
    }

    if (target === sender) {
      await sock.sendMessage(jid, { text: '> No puedes aceptarte a ti mismo.' }, { quoted: msg })
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

    patchUserData(sender, { profile: { marry: target } })

    const sName = getUserData(sender, pushName).name || pushName
    const tName = them.name || n(target)
    await sock.sendMessage(jid, {
      text: `🥳 *¡Felicidades!*\n\n@${n(sender)} 💑 @${n(target)}\n_${sName} y ${tName} ahora son pareja oficial._`,
      mentions: [sender, target],
    }, { quoted: msg })
  },
}

export default command
