import type { Command } from '../../../types/index.js'
import { getUserData, patchUserData } from '@core/events.js'
import { safeSend } from '@lib/media_sender.js'

// Transferencia rápida de BrasCoins desde billetera
// Uso: !pay <monto> @mencionar

const command: Command = {
  name:        'pay',
  aliases:     ['pagar', 'send', 'give'],
  description: 'Transfiere BrasCoins a otro usuario  |  !pay 1000 @usuario',
  category:    'rpg',
  cooldown:    5,
  register:    true,

  async execute({ sock, jid, msg, sender, pushName, args, prefix }) {
    const amountArg = args[0]
    const target    = (msg.message?.extendedTextMessage?.contextInfo?.mentionedJid ?? [])[0]

    if (!amountArg || !target) {
      await safeSend(() => sock.sendMessage(jid, {
        text: [
          `❓ *¿A quién quieras regalar CodPoints?*`,
          ``,
          `_Ejemplo_ » \`${prefix}pay 25000 @mencion\``,
        ].join('\n'),
      }, { quoted: msg }))
      return
    }

    if (target === sender) {
      await safeSend(() => sock.sendMessage(jid, {
        text: `> No puedes enviarte CodPoints a ti mismo.`,
      }, { quoted: msg }))
      return
    }

    const amount = parseInt(amountArg)
    if (isNaN(amount) || amount < 1) {
      await safeSend(() => sock.sendMessage(jid, {
        text: `> Ingresa una cantidad válida.`,
      }, { quoted: msg }))
      return
    }

    const from = getUserData(sender, pushName)
    if (from.money < amount) {
      await safeSend(() => sock.sendMessage(jid, {
        text: [
          `> No tienes suficientes CodPoints en la billetera.`,
          `> Tienes ¥${from.money.toLocaleString()} — necesitas ¥${amount.toLocaleString()}`,
        ].join('\n'),
      }, { quoted: msg }))
      return
    }

    const to = getUserData(target)

    patchUserData(sender, { money: from.money - amount })
    patchUserData(target, { money: to.money   + amount })

    const newBalance = from.money - amount

    await safeSend(() => sock.sendMessage(jid, {
      text: [
        `✧ Transferiste *¥${amount.toLocaleString()} CodPoints* a @${target.split('@')[0]}`,
        ``,
        `Ahora tienes *¥${newBalance.toLocaleString()} CodPoints* en la billetera.`,
      ].join('\n'),
      mentions: [target],
    }, { quoted: msg }))
  },
}

export default command
