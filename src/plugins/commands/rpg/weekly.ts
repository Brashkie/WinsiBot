import type { Command } from '../../../types/index.js'
import {
  getUserData, patchUserData,
  isOnCooldown, setCooldown, getCooldownLeft, fmtCooldown,
  checkLevelUp, levelUpLine,
} from '@core/events.js'
import { randomChoice as pick } from '@lib/utils.js'

const CD = 3 * 24 * 60 * 60_000

const command: Command = {
  name: 'weekly',
  aliases: ['semana', 'semanal', 'cadasemana'],
  description: 'Recompensa semanal — cada 3 días',
  category: 'rpg',
  cooldown: 0,
  level: 7,

  async execute({ sock, jid, msg, sender, pushName }) {
    if (isOnCooldown(sender, 'lastWeekly', CD)) {
      const left = getCooldownLeft(sender, 'lastWeekly', CD)
      await sock.sendMessage(jid, {
        text: `> ⏳ Recompensa semanal ya reclamada. Vuelve en *${fmtCooldown(left)}*.`,
      }, { quoted: msg })
      return
    }

    const user   = getUserData(sender, pushName)
    const isPrem = user.premium

    const exp      = isPrem ? pick([3000,4500,6600,8500,10500,15000]) : pick([1000,1800,2500,3700,5000,6500])
    const diamonds = isPrem ? pick([8,14,18,27,33,40])                : pick([3,5,8,11,16,20])
    const money    = isPrem ? pick([1500,2000,2500,3000,4000])        : pick([500,800,1000,1500,2000])
    const sword    = isPrem ? pick([2,3,5,8]) : pick([1,1,2,2])
    const sp       = isPrem ? pick([5,7,9,10]) : pick([2,2,3,4,5])

    patchUserData(sender, {
      exp:      user.exp + exp,
      diamonds: user.diamonds + diamonds,
      money:    user.money + money,
      items:    { ...user.items, sword: user.items.sword + sword, sp: user.items.sp + sp },
    })
    setCooldown(sender, 'lastWeekly')

    const leveled = checkLevelUp(sender)
    const lvlLine = levelUpLine(leveled)

    await sock.sendMessage(jid, {
      text: `> +${exp} XP  ·  +¥${money.toLocaleString()} BrasCoins\n> +${diamonds} 💎  ·  +${sword} ⚔️  ·  +${sp} ✨${lvlLine}\n\n_Próxima recompensa en 3 días_`,
    }, { quoted: msg })
  },
}

export default command
