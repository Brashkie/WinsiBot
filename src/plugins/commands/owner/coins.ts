import type { Command } from '../../../types/index.js'
import { getUserData } from '@core/events/index.js'
import { safeSend } from '@lib/media_sender.js'
import { cambiarSaldos } from '@core/economy.js'
import { textoDeMotivo } from '@lib/ledger.js'
import { montoDe } from '@lib/amount.js'

const command: Command = {
  name:        'addcoins',
  aliases:     ['delcoins', 'quitarcoins', 'darcoins'],
  description: 'Añade o quita monedas a un usuario',
  category:    'owner',
  ownerOnly:   true,

  async execute({ sock, jid, msg, command: cmd, args }) {
    const isAdd    = cmd === 'addcoins' || cmd === 'darcoins'
    const ctx_info = msg.message?.extendedTextMessage?.contextInfo
    const target   = ctx_info?.mentionedJid?.[0]
      ?? ctx_info?.participant
      ?? (args[0]?.startsWith('@') ? `${args[0].replace('@', '')}@s.whatsapp.net` : null)

    // El primer argumento que sea un monto (la mención empieza con @).
    const amountArg = args.find(a => !a.startsWith('@') && !Number.isNaN(montoDe(a)))
    // montoDe: "1.000" son mil, y "12abc" no es un monto.
    const amount    = amountArg ? montoDe(amountArg) : 0

    if (!target || amount < 1) {
      await safeSend(() => sock.sendMessage(jid, {
        text: `§ Uso: !${cmd} @usuario <cantidad>\nEjemplo: !${cmd} @usuario 500`,
      }, { quoted: msg }))
      return
    }

    const number = target.replace('@s.whatsapp.net', '').replace(/[^0-9]/g, '')
    const user   = getUserData(target, '')

    if (!isAdd && user.money < amount) {
      await safeSend(() => sock.sendMessage(jid, {
        text: `§ @${number} solo tiene ¥${user.money}`,
        mentions: [target],
      }, { quoted: msg }))
      return
    }

    // También el owner pasa por la operación de Ada/SPARK: ningún saldo
    // queda negativo ni por encima del último entero exacto.
    const r = await cambiarSaldos([{ cuenta: { jid: target, campo: 'money' }, delta: isAdd ? amount : -amount }])
    if (!r.ok) {
      await safeSend(() => sock.sendMessage(jid, { text: `§ ${textoDeMotivo(r.motivo)}` }, { quoted: msg }))
      return
    }

    await safeSend(() => sock.sendMessage(jid, {
      text: [
        isAdd ? `✔ *+¥${amount} añadidas*` : `✔ *-¥${amount} quitadas*`,
        ``,
        `§ Usuario: @${number}`,
        `§ Balance: ¥${r.saldos[0]}`,
      ].join('\n'),
      mentions: [target],
    }, { quoted: msg }))
  },
}

export default command
