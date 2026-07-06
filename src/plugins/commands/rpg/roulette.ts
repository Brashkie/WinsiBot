import type { Command } from '../../../types/index.js'
import {
  getUserData, patchUserData,
  isOnCooldown, setCooldown, getCooldownLeft, fmtCooldown,
} from '@core/events.js'
import { safeSend } from '@lib/media_sender.js'
import { randomNumber as rand } from '@lib/utils.js'

// Números rojos en la ruleta estándar (0-36)
const RED_NUMS = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36])

const CD = 15_000  // 15 segundos entre tiradas

function colorOf(n: number): 'red' | 'black' | 'green' {
  if (n === 0)            return 'green'
  if (RED_NUMS.has(n))    return 'red'
  return 'black'
}

const COLOR_EMOJI: Record<string, string> = {
  red:   '🔴',
  black: '⚫',
  green: '🟢',
}

const COLOR_LABEL: Record<string, string> = {
  red:   'red',
  black: 'black',
  green: 'green',
}

const command: Command = {
  name:        'roulette',
  aliases:     ['rt', 'ruleta', 'spin', 'girar'],
  description: 'Apuesta en la ruleta  |  !rt <red|black|0-36> <monto>',
  category:    'rpg',
  cooldown:    0,
  register:    true,

  async execute({ sock, jid, msg, sender, pushName, args, prefix }) {
    if (isOnCooldown(sender, 'lastBet', CD)) {
      const left = getCooldownLeft(sender, 'lastBet', CD)
      await safeSend(() => sock.sendMessage(jid, {
        text: `> ⏳ La ruleta aún gira. Espera *${fmtCooldown(left)}*.`,
      }, { quoted: msg }))
      return
    }

    const [betArg, amtArg] = args

    if (!betArg || !amtArg) {
      await safeSend(() => sock.sendMessage(jid, {
        text: [
          `🎰 *RULETA*`,
          ``,
          `\`${prefix}rt <apuesta> <monto>\``,
          ``,
          `  Apuestas:`,
          `   🔴 \`red\`    — paga ×2`,
          `   ⚫ \`black\`  — paga ×2`,
          `   🟢 \`0\`      — paga ×35`,
          `   🔢 \`1-36\`   — número exacto, paga ×35`,
          ``,
          `  Ejemplo: \`${prefix}rt red 5000\``,
        ].join('\n'),
      }, { quoted: msg }))
      return
    }

    const amount = parseInt(amtArg)
    if (isNaN(amount) || amount < 10) {
      await safeSend(() => sock.sendMessage(jid, {
        text: `> Monto mínimo: ¥10`,
      }, { quoted: msg }))
      return
    }

    const user = getUserData(sender, pushName)
    if (user.money < amount) {
      await safeSend(() => sock.sendMessage(jid, {
        text: `> No tienes suficientes CodPoints (tienes ¥${user.money.toLocaleString()})`,
      }, { quoted: msg }))
      return
    }

    // Parsear apuesta
    const betLower  = betArg.toLowerCase()
    let betType: 'color' | 'number'
    let betColor: 'red' | 'black' | 'green' | null  = null
    let betNumber: number | null = null

    if (betLower === 'red' || betLower === 'rojo') {
      betType = 'color'; betColor = 'red'
    } else if (betLower === 'black' || betLower === 'negro') {
      betType = 'color'; betColor = 'black'
    } else if (betLower === 'green' || betLower === 'verde' || betLower === '0') {
      betType = 'color'; betColor = 'green'
    } else {
      const n = parseInt(betArg)
      if (isNaN(n) || n < 0 || n > 36) {
        await safeSend(() => sock.sendMessage(jid, {
          text: `> Apuesta inválida. Usa \`red\`, \`black\` o un número del 0 al 36.`,
        }, { quoted: msg }))
        return
      }
      betType = 'number'; betNumber = n
    }

    // Girar
    const result = rand(0, 36)
    const resultColor = colorOf(result)

    // Evaluar victoria
    let won    = false
    let payout = 0

    if (betType === 'color') {
      won    = resultColor === betColor
      payout = won ? amount : -amount   // 1:1
    } else {
      won    = result === betNumber
      payout = won ? amount * 35 : -amount  // 35:1
    }

    // Aplicar
    setCooldown(sender, 'lastBet')
    const newBalance = user.money + payout
    patchUserData(sender, { money: Math.max(0, newBalance) })

    // Formato del resultado
    const resultEmoji = COLOR_EMOJI[resultColor]!
    const resultLabel = COLOR_LABEL[resultColor]!
    const betLabel    = betType === 'color'
      ? `${COLOR_EMOJI[betColor!]} ${betColor}`
      : `🔢 número ${betNumber}`

    const text = won
      ? [
          `🎰 La ruleta cayó en *${resultEmoji} ${result} ${resultLabel}*`,
          ``,
          `✅ Apostaste ${betLabel} — *¡GANASTE!*`,
          `Ganancia: *+¥${Math.abs(payout).toLocaleString()} CodPoints*`,
          `Balance: ¥${Math.max(0, newBalance).toLocaleString()}`,
        ].join('\n')
      : [
          `🎰 La ruleta salió en *${resultEmoji} ${result} ${resultLabel}* y has perdido *¥${amount.toLocaleString()} CodPoints!*`,
          ``,
          `Balance: ¥${Math.max(0, newBalance).toLocaleString()}`,
        ].join('\n')

    await safeSend(() => sock.sendMessage(jid, { text }, { quoted: msg }))
  },
}

export default command
