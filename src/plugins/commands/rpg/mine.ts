import type { Command } from '../../../types/index.js'
import {
  getUserData, patchUserData,
  isOnCooldown, setCooldown, getCooldownLeft, fmtCooldown,
  checkLevelUp, levelUpLine,
} from '@core/events.js'
import { safeSend } from '@lib/media_sender.js'
import { randomNumber as rand, randomChoice as pick } from '@lib/utils.js'

const CD = 10 * 60_000

const MSGS: Array<(xp: number, gold: number) => string> = [
  (xp, g) => `⛏️ Bajaste a las profundidades de la mina y encontraste una vena de cristal puro. Extraíste *${xp} XP* y *¥${g}* en minerales.`,
  (xp, g) => `💎 Tu pico golpeó algo duro... ¡un depósito de gemas! La veta te dejó *${xp} XP* y *¥${g}* antes de agotarse.`,
  (xp, g) => `🪨 Con horas de esfuerzo, atravesaste la roca más dura del túnel norte. El botín: *${xp} XP* y *¥${g}* en minerales raros.`,
  (xp, g) => `⚡ Un destello en la oscuridad — venas de cuarzo luminoso. Minaste rápido antes de que colapsara: *${xp} XP* y *¥${g}*.`,
  (xp, g) => `🔦 Exploraste un túnel olvidado que nadie había tocado en años. Ahí encontraste *${xp} XP* de experiencia y *¥${g}* en metales.`,
  (xp, g) => `🌋 El suelo temblaba pero no te detuviste. Justo a tiempo sacaste *${xp} XP* y *¥${g}* antes de que el pasaje se derrumbara.`,
  (xp, g) => `🪙 Tu farol iluminó un nido de minerales brillantes enterrados hace siglos. Ganaste *${xp} XP* y *¥${g}* en recursos.`,
  (xp, g) => `💼 Un enano viejo te enseñó la técnica de minado profundo. Aplicándola, obtuviste *${xp} XP* y *¥${g}* en un solo turno.`,
  (xp, g) => `🔩 Las paredes de hierro oxidado escondían oro puro detrás. Paciencia y pico: *${xp} XP* y *¥${g}* bien ganados.`,
  (xp, g) => `🕳️ Te aventuraste más profundo que nadie en la mina y regresaste con *${xp} XP* y *¥${g}* que nadie más se atrevió a buscar.`,
]

const PREM_MSGS: Array<(xp: number, g: number) => string> = [
  (xp, g) => `👑 Con tu equipo premium de titanio, rompiste la roca volcánica más dura. Botín exclusivo: *${xp} XP* y *¥${g}* en metales raros.`,
  (xp, g) => `⚙️ Tu detector de venas marca rojo intenso — jackpot. Extraíste *${xp} XP* y *¥${g}* de un depósito virginal.`,
  (xp, g) => `🌟 El mapa de minería premium te llevó directo a una bolsa de gemas oculta. *${xp} XP* y *¥${g}* son tuyos.`,
]

const command: Command = {
  name:     'mine',
  aliases:  ['minar', 'minarxp', 'mining', 'mina'],
  description: 'Mina recursos cada 10 minutos',
  category: 'rpg',
  cooldown: 0,

  async execute({ sock, jid, msg, sender, pushName }) {
    if (isOnCooldown(sender, 'lastMining', CD)) {
      const left = getCooldownLeft(sender, 'lastMining', CD)
      await safeSend(() => sock.sendMessage(jid, {
        text: `> ⏳ Aún estás recuperándote. Vuelve en *${fmtCooldown(left)}*.`,
      }, { quoted: msg }))
      return
    }

    const user   = getUserData(sender, pushName)
    const isPrem = user.premium

    const exp      = isPrem ? rand(500, 4000) : rand(100, 2000)
    const money    = isPrem ? rand(500, 2000) : rand(100, 800)
    const diamonds = isPrem ? rand(0, 5)      : rand(0, 2)
    const sp       = isPrem ? rand(1, 4)      : rand(0, 2)

    patchUserData(sender, {
      exp:      user.exp + exp,
      money:    user.money + money,
      diamonds: user.diamonds + diamonds,
      items:    { ...user.items, sp: user.items.sp + sp },
    })
    setCooldown(sender, 'lastMining')

    const leveled = checkLevelUp(sender)
    const lvlLine = levelUpLine(leveled)

    const story = isPrem ? pick(PREM_MSGS)(exp, money) : pick(MSGS)(exp, money)
    const extras = [
      diamonds > 0 ? `+${diamonds} 💎` : '',
      sp > 0 ? `+${sp} ✨` : '',
    ].filter(Boolean).join('  ')

    await safeSend(() => sock.sendMessage(jid, {
      text: [
        `> ${story}`,
        extras ? `> ${extras}` : '',
        lvlLine,
        ``,
        `_Próxima minería en 10 min_`,
      ].filter(s => s !== '').join('\n'),
    }, { quoted: msg }))
  },
}

export default command
