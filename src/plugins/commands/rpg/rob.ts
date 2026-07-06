import type { Command } from '../../../types/index.js'
import {
  getUserData, patchUserData,
  isOnCooldown, setCooldown, getCooldownLeft, fmtCooldown,
} from '@core/events.js'
import { randomNumber as rand } from '@lib/utils.js'

const CD      = 2 * 60 * 60_000
const MAX_ROB = 4_000

const command: Command = {
  name: 'rob',
  aliases: ['robar'],
  description: 'Roba BrasCoins a alguien (@mencionar)',
  category: 'rpg',
  cooldown: 0,
  groupOnly: true,
  register: true,

  async execute({ sock, jid, msg, sender, pushName }) {
    if (isOnCooldown(sender, 'lastRob', CD)) {
      const left = getCooldownLeft(sender, 'lastRob', CD)
      await sock.sendMessage(jid, {
        text: `> Espera *${fmtCooldown(left)}* para volver a robar.`,
      }, { quoted: msg })
      return
    }

    const target = (msg.message?.extendedTextMessage?.contextInfo?.mentionedJid ?? [])[0]
               ?? msg.message?.extendedTextMessage?.contextInfo?.participant

    if (!target || target === sender) {
      await sock.sendMessage(jid, {
        text: `> Etiqueta a alguien. Ej: \`!rob @usuario\``,
      }, { quoted: msg })
      return
    }

    const victim = getUserData(target)
    const thief  = getUserData(sender, pushName)

    if (victim.money < 100) {
      await sock.sendMessage(jid, {
        text: `> @${target.split('@')[0]} no tiene nada que robar.`,
        mentions: [target],
      }, { quoted: msg })
      return
    }

    const amount = rand(100, Math.min(MAX_ROB, Math.floor(victim.money * 0.3)))

    patchUserData(sender, { money: thief.money + amount })
    patchUserData(target, { money: Math.max(0, victim.money - amount) })
    setCooldown(sender, 'lastRob')

    await sock.sendMessage(jid, {
      text: `*ROB* ✓\n> Le robaste *¥${amount}* a @${target.split('@')[0]}\n_Próximo robo en 2h_`,
      mentions: [target],
    }, { quoted: msg })
  },
}

export default command
