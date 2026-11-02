import type { Command } from '../../../types/index.js'
import { safeSend } from '@lib/media_sender.js'
import { getUserData, patchUserData } from '@core/events.js'
import { cambiarSaldos } from '@core/economy.js'
import { textoDeMotivo } from '@lib/ledger.js'
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

    // Los negocios se marcan cobrados ANTES de cobrar: con la espera, dos
    // #collect a la vez habrían cobrado el mismo ingreso. Si el cobro falla,
    // vuelven como estaban.
    const previos = user.businesses
    patchUserData(sender, { businesses: updated })
    const r = await cambiarSaldos([{ cuenta: { jid: sender, campo: 'money' }, delta: total }])
    if (!r.ok) {
      patchUserData(sender, { businesses: previos })
      await safeSend(() => sock.sendMessage(jid, { text: `✗ ${textoDeMotivo(r.motivo)}` }, { quoted: msg }))
      return
    }

    await safeSend(() => sock.sendMessage(jid, {
      text: [
        `╭─「 🏭 COBRO REALIZADO 」`,
        `│`,
        ...rows,
        `│`,
        `> Total  +¥${total.toLocaleString()}`,
        `> Balance ¥${r.saldos[0]!.toLocaleString()}`,
        `╰─`,
      ].join('\n'),
    }, { quoted: msg }))
  },
}

export default command
