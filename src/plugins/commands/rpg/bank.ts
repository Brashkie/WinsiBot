import type { Command } from '../../../types/index.js'
import { getUserData } from '@core/events.js'
import { moverSaldo } from '@core/economy.js'
import { textoDeMotivo } from '@lib/ledger.js'
import { montoDe } from '@lib/amount.js'

const command: Command = {
  name: 'depositar',
  aliases: ['d', 'dep', 'deposit', 'retirar', 'withdraw', 'banco'],
  description: 'Deposita o retira BrasCoins del banco',
  category: 'rpg',
  cooldown: 3,

  async execute({ sock, jid, msg, sender, pushName, command: cmd, args }) {
    const user       = getUserData(sender, pushName)
    const isWithdraw = ['retirar', 'withdraw'].includes(cmd)

    if (!args[0]) {
      await sock.sendMessage(jid, {
        text: `*BANCO*

> Billetera  ¥${user.money}
> Banco      ¥${user.bank}

\`!dep cantidad\`     — depositar
\`!retirar cantidad\` — retirar
\`!dep all\`          — depositar todo`,
      }, { quoted: msg })
      return
    }

    const allFlag = args[0].toLowerCase() === 'all'
    const amount  = allFlag
      ? (isWithdraw ? user.bank : user.money)
      : montoDe(args[0])

    if (!allFlag && (Number.isNaN(amount) || amount <= 0)) {
      await sock.sendMessage(jid, { text: '> Ingresa una cantidad valida.' }, { quoted: msg })
      return
    }

    // De la billetera al banco o al revés: la misma operación que #pay, entre
    // dos campos del mismo usuario, decidida por Ada/SPARK (ver lib/ledger.ts).
    // `!dep all` con 0 ya no "deposita ¥0": es un monto inválido.
    const billetera = { jid: sender, campo: 'money' as const }
    const banco     = { jid: sender, campo: 'bank' as const }
    const r = await moverSaldo(isWithdraw
      ? { origen: banco, destino: billetera, monto: amount }
      : { origen: billetera, destino: banco, monto: amount })

    if (!r.ok) {
      const sinSaldo = isWithdraw ? '> No tienes suficiente en el banco.' : '> No tienes suficiente en la billetera.'
      await sock.sendMessage(jid, {
        text: r.motivo === 'sin_saldo' ? sinSaldo : `> ${textoDeMotivo(r.motivo)}`,
      }, { quoted: msg })
      return
    }
    await sock.sendMessage(jid, {
      text: isWithdraw
        ? `*RETIRO* ✓\n\n> ¥${amount} retirado del banco\n> Billetera  *¥${r.destino}*`
        : `*DEPOSITO* ✓\n\n> ¥${amount} ingresado al banco\n> Banco  *¥${r.destino}*`,
    }, { quoted: msg })
  },
}

export default command
