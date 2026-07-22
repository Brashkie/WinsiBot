import type { Command } from '../../../types/index.js'
import { safeSend } from '@lib/media_sender.js'
import { getUserData, patchUserData } from '@core/events.js'
import { findBusiness, pendingIncome } from '@lib/business.js'

const command: Command = {
  name:        'collect',
  aliases:     ['recolectar', 'cobrar'],
  description: 'Cobra el ingreso pasivo acumulado de tus negocios',
  category:    'rpg',
  cooldown:    5,

  async execute({ sock, jid, msg, sender, pushName, prefix }) {
    const user = getUserData(sender, pushName)

    if (!user.businesses.length) {
      await safeSend(() => sock.sendMessage(jid, {
        text: `✗ No tenés negocios todavía.\n§ Usá ${prefix}business para ver el catálogo.`,
      }, { quoted: msg }))
      return
    }

    const now = Date.now()
    let total = 0
    const rows: string[] = []

    const updated = user.businesses.map(ob => {
      const def = findBusiness(ob.id)
      if (!def) return ob   // negocio descontinuado del catálogo — se ignora, no se pierde

      const income = pendingIncome(def.hourlyRate, ob.lastCollect)
      if (income > 0) {
        total += income
        rows.push(`│ ${def.emoji} \`${def.name}\`  +¥${income.toLocaleString()}`)
      }
      return { ...ob, lastCollect: now }
    })

    if (total <= 0) {
      await safeSend(() => sock.sendMessage(jid, {
        text: `✗ Todavía no acumulaste nada — volvé en un rato.`,
      }, { quoted: msg }))
      return
    }

    patchUserData(sender, {
      money:      user.money + total,
      businesses: updated,
    })

    await safeSend(() => sock.sendMessage(jid, {
      text: [
        `╭─「 🏭 COBRO REALIZADO 」`,
        `│`,
        ...rows,
        `│`,
        `> Total  +¥${total.toLocaleString()}`,
        `> Balance ¥${(user.money + total).toLocaleString()}`,
        `╰─`,
      ].join('\n'),
    }, { quoted: msg }))
  },
}

export default command
