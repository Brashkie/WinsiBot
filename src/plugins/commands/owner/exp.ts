import type { Command } from '../../../types/index.js'
import { getUserData } from '@core/events/index.js'
import { safeSend } from '@lib/media_sender.js'
import { cambiarSaldos } from '@core/economy.js'
import { textoDeMotivo } from '@lib/ledger.js'
import { montoDe } from '@lib/amount.js'

const command: Command = {
  name:        'addexp',
  aliases:     ['delexp', 'addxp', 'delxp', 'darexp', 'quitarexp'],
  description: 'Añade o quita EXP a un usuario',
  category:    'owner',
  ownerOnly:   true,

  async execute({ sock, jid, msg, command: cmd, args }) {
    const isAdd    = cmd === 'addexp' || cmd === 'addxp' || cmd === 'darexp'
    const ctx_info = msg.message?.extendedTextMessage?.contextInfo
    const target   = ctx_info?.mentionedJid?.[0]
      ?? ctx_info?.participant
      ?? (args[0]?.startsWith('@') ? `${args[0].replace('@', '')}@s.whatsapp.net` : null)

    // montoDe: "1.000" son mil, y "12abc" no es un monto.
    const amountArg = args.find(a => !a.startsWith('@') && !Number.isNaN(montoDe(a)))
    const amount    = amountArg ? montoDe(amountArg) : 0

    if (!target || amount < 1) {
      await safeSend(() => sock.sendMessage(jid, {
        text: `§ Uso: !${cmd} @usuario <cantidad>`,
      }, { quoted: msg }))
      return
    }

    const number = target.replace('@s.whatsapp.net', '').replace(/[^0-9]/g, '')
    const user   = getUserData(target, '')

    if (!isAdd && user.exp < amount) {
      await safeSend(() => sock.sendMessage(jid, {
        text: `§ @${number} solo tiene ${user.exp} EXP`,
        mentions: [target],
      }, { quoted: msg }))
      return
    }

    // También el owner pasa por la operación de Ada/SPARK: la XP no queda
    // negativa ni por encima del último entero exacto.
    const r = await cambiarSaldos([{ cuenta: { jid: target, campo: 'exp' }, delta: isAdd ? amount : -amount }])
    if (!r.ok) {
      await safeSend(() => sock.sendMessage(jid, { text: `§ ${textoDeMotivo(r.motivo)}` }, { quoted: msg }))
      return
    }

    await safeSend(() => sock.sendMessage(jid, {
      text: [
        isAdd ? `✔ *+${amount} EXP añadidos*` : `✔ *-${amount} EXP quitados*`,
        ``,
        `§ Usuario: @${number}`,
        `§ Total:   ${r.saldos[0]} EXP`,
      ].join('\n'),
      mentions: [target],
    }, { quoted: msg }))
  },
}

export default command
