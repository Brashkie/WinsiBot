import type { Command } from '../../../types/index.js'
import { getUserData, patchUserData } from '@core/events.js'

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
      : parseInt(args[0])

    if (!allFlag && (isNaN(amount) || amount <= 0)) {
      await sock.sendMessage(jid, { text: '> Ingresa una cantidad valida.' }, { quoted: msg })
      return
    }

    if (isWithdraw) {
      if (user.bank < amount) {
        await sock.sendMessage(jid, { text: '> No tienes suficiente en el banco.' }, { quoted: msg })
        return
      }
      patchUserData(sender, { bank: user.bank - amount, money: user.money + amount })
      await sock.sendMessage(jid, {
        text: `*RETIRO* ✓\n\n> ¥${amount} retirado del banco\n> Billetera  *¥${user.money + amount}*`,
      }, { quoted: msg })
    } else {
      if (user.money < amount) {
        await sock.sendMessage(jid, { text: '> No tienes suficiente en la billetera.' }, { quoted: msg })
        return
      }
      patchUserData(sender, { bank: user.bank + amount, money: user.money - amount })
      await sock.sendMessage(jid, {
        text: `*DEPOSITO* ✓\n\n> ¥${amount} ingresado al banco\n> Banco  *¥${user.bank + amount}*`,
      }, { quoted: msg })
    }
  },
}

export default command
