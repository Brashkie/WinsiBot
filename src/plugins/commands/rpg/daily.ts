import type { Command } from '../../../types/index.js'
import {
  getUserData, patchUserData,
  isOnCooldown, setCooldown, getCooldownLeft, fmtCooldown,
  checkLevelUp,
} from '@core/events.js'

const CD = 2 * 60 * 60_000

const rand = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min
const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)]!

const command: Command = {
  name: 'daily',
  aliases: ['claim', 'reclamar', 'reclamo', 'regalo'],
  description: 'Reclama tu recompensa cada 2 horas',
  category: 'rpg',
  cooldown: 0,

  async execute({ sock, jid, msg, sender, pushName }) {
    if (isOnCooldown(sender, 'lastClaim', CD)) {
      const left = getCooldownLeft(sender, 'lastClaim', CD)
      await sock.sendMessage(jid, {
        text: `> ⏳ Ya reclamaste. Vuelve en *${fmtCooldown(left)}*.`,
      }, { quoted: msg })
      return
    }

    const user   = getUserData(sender, pushName)
    const isPrem = user.premium

    const exp      = isPrem ? pick([1000,1500,1800,2100,2500,3600,4500]) : pick([500,600,700,800,999,1300,1800])
    const money    = isPrem ? pick([800,1300,1600,1900,2500,3000,3500])  : pick([300,500,700,900,1100,1500])
    const diamonds = isPrem ? rand(4, 12) : rand(1, 5)
    const pc       = isPrem ? rand(2, 6)  : rand(1, 3)

    patchUserData(sender, {
      exp:      user.exp + exp,
      money:    user.money + money,
      diamonds: user.diamonds + diamonds,
      items:    { ...user.items, pc: user.items.pc + pc },
    })
    setCooldown(sender, 'lastClaim')

    const leveled = checkLevelUp(sender)
    const lvlLine = leveled > 0 ? `\n> ◆ *¡Subiste ${leveled} nivel(es)!*` : ''

    await sock.sendMessage(jid, {
      text: `*RECOMPENSA DIARIA* ${isPrem ? '★' : ''}

> +${exp} XP
> +¥${money} BrasCoins
> +${diamonds} Diamantes
> +${pc} Pociones${lvlLine}

_Próximo reclamo en 2h_`,
    }, { quoted: msg })
  },
}

export default command
