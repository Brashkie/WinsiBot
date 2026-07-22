import type { Command } from '../../../types/index.js'
import {
  getUserData, patchUserData,
  isOnCooldown, setCooldown, getCooldownLeft, fmtCooldown,
  checkLevelUp, levelUpLine,
} from '@core/events.js'
import { randomNumber as rand, randomChoice as pick } from '@lib/utils.js'

const CD = 5 * 24 * 60 * 60_000

const command: Command = {
  name: 'monthly',
  aliases: ['mes', 'mensual', 'cadames'],
  description: 'Recompensa mensual — cada 5 días',
  category: 'rpg',
  cooldown: 0,
  level: 10,

  async execute({ sock, jid, msg, sender, pushName }) {
    if (isOnCooldown(sender, 'lastMonthly', CD)) {
      const left = getCooldownLeft(sender, 'lastMonthly', CD)
      await sock.sendMessage(jid, {
        text: `> ⏳ Recompensa mensual ya reclamada. Vuelve en *${fmtCooldown(left)}*.`,
      }, { quoted: msg })
      return
    }

    const user   = getUserData(sender, pushName)
    const isPrem = user.premium

    const exp       = isPrem ? rand(15000, 30000) : rand(5000, 12000)
    const diamonds  = isPrem ? pick([45,59,88,120,150]) : pick([15,23,36,50,70])
    const money     = isPrem ? rand(5000, 15000)  : rand(2000, 6000)
    const legendary = isPrem ? pick([4,6,7,9,10]) : pick([2,2,3,4])
    const sword     = isPrem ? rand(3, 8) : rand(1, 4)
    const sp        = isPrem ? rand(10, 20) : rand(5, 10)

    patchUserData(sender, {
      exp:      user.exp + exp,
      diamonds: user.diamonds + diamonds,
      money:    user.money + money,
      items:    { ...user.items, legendary: user.items.legendary + legendary, sword: user.items.sword + sword, sp: user.items.sp + sp },
    })
    setCooldown(sender, 'lastMonthly')

    const leveled = checkLevelUp(sender)
    const lvlLine = levelUpLine(leveled, jid)

    await sock.sendMessage(jid, {
      text: `*RECOMPENSA MENSUAL* ${isPrem ? '★' : ''}

> +${exp} XP
> +¥${money} BrasCoins
> +${diamonds} Diamantes
> +${legendary} Legendarios  · +${sword} Espadas
> +${sp} Puntos de Magia${lvlLine}

_Próxima recompensa en 5 días_`,
    }, { quoted: msg })
  },
}

export default command
