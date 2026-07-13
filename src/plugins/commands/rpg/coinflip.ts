import type { Command } from '../../../types/index.js'
import {
  getUserData, patchUserData,
  isOnCooldown, setCooldown, getCooldownLeft, fmtCooldown,
} from '@core/events.js'
import { safeSend } from '@lib/media_sender.js'

const CD = 20_000  // 20s entre tiradas

const command: Command = {
  name:        'coinflip',
  aliases:     ['cf', 'cara', 'moneda', 'flip'],
  description: 'Lanza una moneda  |  !cf [cara|cruz] <monto>',
  category:    'rpg',
  cooldown:    0,

  async execute({ sock, jid, msg, sender, pushName, args, prefix }) {
    if (isOnCooldown(sender, 'lastFight', CD)) {
      const left = getCooldownLeft(sender, 'lastFight', CD)
      await safeSend(() => sock.sendMessage(jid, {
        text: `> ⏳ La moneda aún está en el aire. Espera *${fmtCooldown(left)}*.`,
      }, { quoted: msg }))
      return
    }

    // Parsear args: !cf 5000 / !cf cara 5000 / !cf cruz 5000
    let choice: 'cara' | 'cruz'
    let amount: number

    const first  = (args[0] ?? '').toLowerCase()
    const second = args[1]

    if (first === 'cara' || first === 'heads') {
      choice = 'cara'
      amount = parseInt(second ?? '0')
    } else if (first === 'cruz' || first === 'tails') {
      choice = 'cruz'
      amount = parseInt(second ?? '0')
    } else {
      // !cf 5000 — sin elección, default cara
      choice = 'cara'
      amount = parseInt(first)
    }

    if (isNaN(amount) || amount < 10) {
      await safeSend(() => sock.sendMessage(jid, {
        text: [
          `🪙 *COINFLIP*`,
          ``,
          `\`${prefix}cf <cara|cruz> <monto>\``,
          ``,
          `  Si aciertas: ganas ×2 tu apuesta`,
          `  Ejemplo: \`${prefix}cf cara 5000\``,
        ].join('\n'),
      }, { quoted: msg }))
      return
    }

    const user = getUserData(sender, pushName)
    if (user.money < amount) {
      await safeSend(() => sock.sendMessage(jid, {
        text: `> No tienes suficiente (tienes ¥${user.money.toLocaleString()}).`,
      }, { quoted: msg }))
      return
    }

    const result: 'cara' | 'cruz' = Math.random() < 0.5 ? 'cara' : 'cruz'
    const won   = result === choice
    const emoji = result === 'cara' ? '🪙' : '✝️'

    setCooldown(sender, 'lastFight')

    if (won) {
      patchUserData(sender, { money: user.money + amount })
      await safeSend(() => sock.sendMessage(jid, {
        text: [
          `「✧」La moneda ha caído en *${result.charAt(0).toUpperCase() + result.slice(1)}* ${emoji} y has ganado *¥${(amount * 2).toLocaleString()} CodPoints!*`,
          ``,
          `Tu elección fue *${choice.charAt(0).toUpperCase() + choice.slice(1)}*`,
        ].join('\n'),
      }, { quoted: msg }))
    } else {
      patchUserData(sender, { money: Math.max(0, user.money - amount) })
      await safeSend(() => sock.sendMessage(jid, {
        text: [
          `「✧」La moneda ha caído en *${result.charAt(0).toUpperCase() + result.slice(1)}* ${emoji} y has perdido *¥${amount.toLocaleString()} CodPoints!*`,
          ``,
          `Tu elección fue *${choice.charAt(0).toUpperCase() + choice.slice(1)}*`,
        ].join('\n'),
      }, { quoted: msg }))
    }
  },
}

export default command
