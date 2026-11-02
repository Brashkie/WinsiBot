import type { Command } from '../../../types/index.js'
import {
  getUserData,
  isOnCooldown, setCooldown, getCooldownLeft, fmtCooldown,
} from '@core/events.js'
import { cambiarSaldos } from '@core/economy.js'
import { textoDeMotivo } from '@lib/ledger.js'
import { safeSend, sendCritical } from '@lib/media_sender.js'
import { montoDe } from '@lib/amount.js'

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
      amount = montoDe(second ?? '0')
    } else if (first === 'cruz' || first === 'tails') {
      choice = 'cruz'
      amount = montoDe(second ?? '0')
    } else {
      // !cf 5000 — sin elección, default cara
      choice = 'cara'
      amount = montoDe(first)
    }

    if (Number.isNaN(amount) || amount < 10) {
      await safeSend(() => sock.sendMessage(jid, {
        text: [
          `╭─「 🪙 COINFLIP 」`,
          `│`,
          `│ \`${prefix}cf <cara|cruz> <monto>\``,
          `│`,
          `│ Si acertás: ganás ×2 tu apuesta`,
          `╰─ Ejemplo: \`${prefix}cf cara 5000\``,
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

    // Ganar o perder, por la operación de Ada/SPARK (ver core/economy.ts). La
    // pérdida antes era `Math.max(0, saldo - apuesta)`: si en el medio el saldo
    // bajó, lo dejaba en 0 en vez de rechazar la apuesta.
    const r = await cambiarSaldos([{ cuenta: { jid: sender, campo: 'money' }, delta: won ? amount : -amount }])
    if (!r.ok) {
      await safeSend(() => sock.sendMessage(jid, { text: `> ${textoDeMotivo(r.motivo)}` }, { quoted: msg }))
      return
    }
    setCooldown(sender, 'lastFight')

    const resultLabel = result.charAt(0).toUpperCase() + result.slice(1)
    const choiceLabel = choice.charAt(0).toUpperCase() + choice.slice(1)

    // sendCritical en ambas ramas: la apuesta ya se resolvió y el saldo ya se
    // ajustó. Sin el mensaje, el usuario no sabe si ganó o perdió aunque el
    // dinero ya se movió — el outbox lo reenvía si el proceso muere acá.
    if (won) {
      await sendCritical(sock, jid, {
        text: [
          `╭─「 🪙 COINFLIP 」`,
          `│`,
          `> ${emoji} Cayó en *${resultLabel}* — elegiste *${choiceLabel}*`,
          `│`,
          // La apuesta vuelve y se gana otro tanto: el saldo sube `amount`.
          // Hasta la 9.2 decía amount * 2, el doble de lo que entraba.
          `> ¡Ganaste! +¥${amount.toLocaleString()}`,
          `╰─`,
        ].join('\n'),
      }, { quoted: msg })
    } else {
      await sendCritical(sock, jid, {
        text: [
          `╭─「 🪙 COINFLIP 」`,
          `│`,
          `> ${emoji} Cayó en *${resultLabel}* — elegiste *${choiceLabel}*`,
          `│`,
          `> Perdiste -¥${amount.toLocaleString()}`,
          `╰─`,
        ].join('\n'),
      }, { quoted: msg })
    }
  },
}

export default command
