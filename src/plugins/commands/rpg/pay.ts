import type { Command } from '../../../types/index.js'
import { getUserData } from '@core/events.js'
import { moverSaldo } from '@core/economy.js'
import { textoDeMotivo } from '@lib/ledger.js'
import { safeSend, sendCritical } from '@lib/media_sender.js'
import { montoDe } from '@lib/amount.js'

// Transferencia rápida de BrasCoins desde billetera
// Uso: !pay <monto> @mencionar

const command: Command = {
  name:        'pay',
  aliases:     ['pagar', 'send', 'give'],
  description: 'Transfiere BrasCoins a otro usuario  |  !pay 1000 @usuario',
  category:    'rpg',
  cooldown:    5,

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

    const amount = montoDe(amountArg)
    if (Number.isNaN(amount) || amount < 1) {
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

    // La cuenta la decide Ada/SPARK en la Session API: se conserva el total,
    // nadie queda negativo ni pasa del último entero exacto, y si cambió el
    // saldo en el medio no se aplica (ver lib/ledger.ts).
    const r = await moverSaldo({
      origen:  { jid: sender, campo: 'money' },
      destino: { jid: target, campo: 'money' },
      monto:   amount,
    })
    if (!r.ok) {
      await safeSend(() => sock.sendMessage(jid, { text: `> ${textoDeMotivo(r.motivo)}` }, { quoted: msg }))
      return
    }

    const newBalance = r.origen

    // sendCritical: el dinero YA cambió de manos en las dos cuentas. Si el
    // proceso muere antes de que salga esta confirmación, el outbox la reenvía
    // al arrancar — ver sendCritical en lib/media_sender.ts.
    await sendCritical(sock, jid, {
      text: [
        `✧ Transferiste *¥${amount.toLocaleString()} CodPoints* a @${target.split('@')[0]}`,
        ``,
        `Ahora tienes *¥${newBalance.toLocaleString()} CodPoints* en la billetera.`,
      ].join('\n'),
      mentions: [target],
    }, { quoted: msg })
  },
}

export default command
