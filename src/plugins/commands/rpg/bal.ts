import type { Command } from '../../../types/index.js'
import { getUserData } from '@core/events.js'
import { safeSend, findMedia } from '@lib/media_sender.js'

const command: Command = {
  name:        'bal',
  aliases:     ['balance', 'billetera', 'wallet', 'dinero', 'coins'],
  description: 'Ver tu balance de CodPoints',
  category:    'rpg',
  cooldown:    3,

  async execute({ sock, jid, msg, sender, pushName, prefix }) {
    const target = (msg.message?.extendedTextMessage?.contextInfo?.mentionedJid ?? [])[0] ?? sender
    const user   = getUserData(target, pushName)
    const name   = user.name || pushName || target.split('@')[0]
    const total  = user.money + user.bank

    const text = [
      `✧ ))Economia @~${name}(( ✧`,
      ``,
      `🏧 Dinero » *¥${user.money.toLocaleString()} CodPoints*`,
      `🏦 Banco   » *¥${user.bank.toLocaleString()} CodPoints*`,
      `💳 Total   » *¥${total.toLocaleString()} CodPoints*`,
      ``,
      user.money > 0
        ? `_Para proteger tu dinero, ¡deposítalo en el banco usando \`${prefix}dep\`!_`
        : `_Tu billetera está vacía — ¡trabaja con \`${prefix}work\`!_`,
    ].join('\n')

    const media = await findMedia('CoinsBras')

    if (media.type === 'image' && media.buffer) {
      await safeSend(() => sock.sendMessage(jid, {
        image:    media.buffer!,
        caption:  text,
        mentions: [target],
      }, { quoted: msg }))
    } else {
      await safeSend(() => sock.sendMessage(jid, { text, mentions: [target] }, { quoted: msg }))
    }
  },
}

export default command
