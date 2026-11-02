import type { Command } from '../../../types/index.js'
import {
  getUserData, patchUserData,
  isOnCooldownDaily, getDailyCooldownLeft, fmtCooldown,
  checkLevelUp, levelUpLine,
} from '@core/events.js'
import { cobrarConCooldown } from '@core/economy.js'
import { textoDeMotivo } from '@lib/ledger.js'
import { safeSend } from '@lib/media_sender.js'
import { randomNumber as rand, randomChoice as pick } from '@lib/utils.js'

const OPENERS: Array<(g: number, xp: number, d: number) => string> = [
  (g, xp, d) => `Un mercader misterioso dejó un cofre frente a tu puerta. Al abrirlo encontraste *¥${g}*, *${xp} XP* y *${d} 💎*.`,
  (g, xp, d) => `El mapa de tesoros que compraste por fin valió la pena. El cofre enterrado contenía *¥${g}*, *${xp} XP* y *${d} 💎*.`,
  (g, xp, d) => `Ganaste el cofre diario en la lotería del reino. Dentro: *¥${g}* en oro, *${xp} XP* y *${d} 💎*.`,
  (g, xp, d) => `Un dragón olvidó su botín en tu camino. Te lo apropiaste: *¥${g}*, *${xp} XP* y *${d} 💎*.`,
  (g, xp, d) => `El cofre del gremio de aventureros te corresponde hoy. Contiene *¥${g}*, *${xp} XP* y *${d} 💎*.`,
]

const PREM_OPENERS: Array<(g: number, xp: number, d: number) => string> = [
  (g, xp, d) => `👑 Tu cofre premium brillaba desde lejos. El guardia lo trajo personalmente: *¥${g}*, *${xp} XP* y *${d} 💎* de la bóveda real.`,
  (g, xp, d) => `⭐ Como miembro premium, recibes el cofre dorado del rey. Su contenido: *¥${g}*, *${xp} XP* y *${d} 💎*.`,
  (g, xp, d) => `🔮 El cofre místico de los premium pulsaba de energía. Al abrirlo: *¥${g}*, *${xp} XP* y *${d} 💎* se materializaron.`,
]

const command: Command = {
  name:     'chest',
  aliases:  ['cofre', 'coffer', 'caja', 'tesoro'],
  description: 'Abre el cofre diario — una vez por día, se reinicia a medianoche',
  category: 'rpg',
  level:    5,
  cooldown: 0,

  async execute({ sock, jid, msg, sender, pushName }) {
    if (isOnCooldownDaily(sender, 'lastCofre')) {
      const left = getDailyCooldownLeft()
      await safeSend(() => sock.sendMessage(jid, {
        text: `> 🔒 El cofre está cerrado. Se reinicia en *${fmtCooldown(left)}* (medianoche).`,
      }, { quoted: msg }))
      return
    }

    const user   = getUserData(sender, pushName)
    const isPrem = user.premium

    const diamonds = isPrem ? rand(10, 30)     : rand(3, 15)
    const money    = isPrem ? rand(2000, 5000) : rand(500, 2500)
    const exp      = isPrem ? rand(1500, 4000) : rand(300, 2000)
    const sp       = isPrem ? rand(3, 8)       : rand(1, 4)

    const r = await cobrarConCooldown(sender, 'lastCofre', [
      { cuenta: { jid: sender, campo: 'exp' }, delta: exp },
      { cuenta: { jid: sender, campo: 'money' }, delta: money },
      { cuenta: { jid: sender, campo: 'diamonds' }, delta: diamonds },
    ])
    if (!r.ok) {
      await sock.sendMessage(jid, { text: `> ${textoDeMotivo(r.motivo)}` }, { quoted: msg })
      return
    }
    const ahora = getUserData(sender)
    patchUserData(sender, { items: { ...ahora.items, sp: ahora.items.sp + sp } })

    const leveled = checkLevelUp(sender)
    const lvlLine = levelUpLine(leveled, jid)
    const story   = isPrem ? pick(PREM_OPENERS)(money, exp, diamonds) : pick(OPENERS)(money, exp, diamonds)

    await safeSend(() => sock.sendMessage(jid, {
      text: [
        `> ${story}`,
        sp > 0 ? `> +${sp} ✨` : '',
        lvlLine,
        ``,
        `_El cofre se reinicia a medianoche_`,
      ].filter(Boolean).join('\n'),
    }, { quoted: msg }))
  },
}

export default command
