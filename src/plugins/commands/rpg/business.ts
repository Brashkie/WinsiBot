import type { Command } from '../../../types/index.js'
import { safeSend } from '@lib/media_sender.js'
import { getUserData, patchUserData } from '@core/events.js'
import { BUSINESSES, findBusiness, pendingIncome } from '@lib/business.js'

const command: Command = {
  name:        'business',
  aliases:     ['negocio', 'negocios', 'empresa', 'empresas'],
  description: 'Comprá negocios que generan BrasCoins pasivos — !business [comprar <id>]',
  category:    'rpg',
  cooldown:    3,

  async execute({ sock, jid, msg, sender, pushName, args, prefix }) {
    const user = getUserData(sender, pushName)

    // ─── !business comprar <id> ────────────────────────────────────────────
    if ((args[0] ?? '').toLowerCase() === 'comprar' || (args[0] ?? '').toLowerCase() === 'buy') {
      const id  = args[1]
      const def = id ? findBusiness(id) : undefined

      if (!def) {
        await safeSend(() => sock.sendMessage(jid, {
          text: `✗ Negocio inválido.\n§ Usá \`${prefix}business\` para ver el catálogo.`,
        }, { quoted: msg }))
        return
      }

      if (user.money < def.cost) {
        await safeSend(() => sock.sendMessage(jid, {
          text: `✗ No tenés suficientes BrasCoins (tenés ¥${user.money.toLocaleString()}, necesitás ¥${def.cost.toLocaleString()})`,
        }, { quoted: msg }))
        return
      }

      const now = Date.now()
      patchUserData(sender, {
        money:      user.money - def.cost,
        businesses: [...user.businesses, { id: def.id, boughtAt: now, lastCollect: now }],
      })

      await safeSend(() => sock.sendMessage(jid, {
        text: [
          `╭─「 ${def.emoji} NEGOCIO COMPRADO 」`,
          `│`,
          `> ${def.emoji} \`${def.name}\` — produce ¥${def.hourlyRate.toLocaleString()}/hora`,
          `│`,
          `│ Pagaste  ¥${def.cost.toLocaleString()}`,
          `│ Balance  ¥${(user.money - def.cost).toLocaleString()}`,
          `╰─ § ${prefix}collect para cobrar lo acumulado`,
        ].join('\n'),
      }, { quoted: msg }))
      return
    }

    // ─── !business — catálogo + tus negocios ───────────────────────────────
    const catalog = BUSINESSES.map(b =>
      `│ ${b.emoji} \`${b.id}\`  *${b.name}*  ¥${b.cost.toLocaleString()} → ¥${b.hourlyRate.toLocaleString()}/h`,
    )

    const owned = user.businesses.map(ob => {
      const def = findBusiness(ob.id)
      if (!def) return null
      const pending = pendingIncome(def.hourlyRate, ob.lastCollect)
      return `│ ${def.emoji} \`${def.name}\`  pendiente: ¥${pending.toLocaleString()}`
    }).filter((line): line is string => line !== null)

    await safeSend(() => sock.sendMessage(jid, {
      text: [
        `╭─「 🏭 NEGOCIOS 」`,
        `│`,
        `│ *Catálogo*`,
        ...catalog,
        `│`,
        ...(owned.length
          ? [`│ *Tus negocios*`, ...owned]
          : [`│ Todavía no tenés ningún negocio`]),
        `│`,
        `╰─ § \`${prefix}business comprar <id>\` · \`${prefix}collect\` para cobrar`,
      ].join('\n'),
    }, { quoted: msg }))
  },
}

export default command
