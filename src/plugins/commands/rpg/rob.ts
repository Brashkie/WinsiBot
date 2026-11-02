import type { Command } from '../../../types/index.js'
import {
  getUserData,
  isOnCooldown, setCooldown, getCooldownLeft, fmtCooldown,
} from '@core/events.js'
import { moverSaldo } from '@core/economy.js'
import { textoDeMotivo } from '@lib/ledger.js'
import { randomNumber as rand } from '@lib/utils.js'
import { sendCritical } from '@lib/media_sender.js'

const CD      = 2 * 60 * 60_000
const MAX_ROB = 4_000

const command: Command = {
  name: 'rob',
  aliases: ['robar'],
  description: 'Roba BrasCoins a alguien (@mencionar)',
  category: 'rpg',
  cooldown: 0,
  groupOnly: true,

  async execute({ sock, jid, msg, sender, pushName }) {
    if (isOnCooldown(sender, 'lastRob', CD)) {
      const left = getCooldownLeft(sender, 'lastRob', CD)
      await sock.sendMessage(jid, {
        text: `> Espera *${fmtCooldown(left)}* para volver a robar.`,
      }, { quoted: msg })
      return
    }

    const target = (msg.message?.extendedTextMessage?.contextInfo?.mentionedJid ?? [])[0]
               ?? msg.message?.extendedTextMessage?.contextInfo?.participant

    if (!target || target === sender) {
      await sock.sendMessage(jid, {
        text: `> Etiqueta a alguien. Ej: \`!rob @usuario\``,
      }, { quoted: msg })
      return
    }

    const victim = getUserData(target)
    getUserData(sender, pushName)

    if (victim.money < 100) {
      await sock.sendMessage(jid, {
        text: `> @${target.split('@')[0]} no tiene nada que robar.`,
        mentions: [target],
      }, { quoted: msg })
      return
    }

    const amount = rand(100, Math.min(MAX_ROB, Math.floor(victim.money * 0.3)))

    // De la víctima al ladrón: una transferencia, con el total conservado
    // (Ada/SPARK, ver core/economy.ts). Antes eran dos escrituras, y la de la
    // víctima con Math.max(0, …): si alguna vez el monto pasaba su saldo, el
    // ladrón habría recibido más de lo que ella perdía.
    const r = await moverSaldo({
      origen:  { jid: target, campo: 'money' },
      destino: { jid: sender, campo: 'money' },
      monto:   amount,
    })
    if (!r.ok) {
      await sock.sendMessage(jid, { text: `> ${textoDeMotivo(r.motivo)}` }, { quoted: msg })
      return
    }
    setCooldown(sender, 'lastRob')

    // sendCritical: el dinero ya se movió entre las dos cuentas y el cooldown
    // de 2h ya se consumió — perder este mensaje deja al usuario sin saber si
    // el robo salió o no, con el cooldown gastado igual.
    await sendCritical(sock, jid, {
      text: `*ROB* ✓\n> Le robaste *¥${amount}* a @${target.split('@')[0]}\n_Próximo robo en 2h_`,
      mentions: [target],
    }, { quoted: msg })
  },
}

export default command
