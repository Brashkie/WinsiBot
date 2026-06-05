import type { Command } from '../../../types/index.js'
import {
  getUserData, patchUserData,
  isOnCooldown, setCooldown, getCooldownLeft, fmtCooldown,
  checkLevelUp,
} from '@core/events.js'

const CD = 24 * 60 * 60_000

const rand = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min

const command: Command = {
  name: 'cofre',
  aliases: ['coffer', 'abrircofre', 'caja'],
  description: 'Abre el cofre — disponible cada 24 horas',
  category: 'rpg',
  level: 5,
  cooldown: 0,

  async execute({ sock, jid, msg, sender, pushName }) {
    if (isOnCooldown(sender, 'lastCofre', CD)) {
      const left = getCooldownLeft(sender, 'lastCofre', CD)
      await sock.sendMessage(jid, {
        text: `> 🔒 El cofre está cerrado. Ábrelo de nuevo en *${fmtCooldown(left)}*.`,
      }, { quoted: msg })
      return
    }

    const user   = getUserData(sender, pushName)
    const isPrem = user.premium

    const diamonds = isPrem ? rand(10, 30)     : rand(3, 15)
    const money    = isPrem ? rand(2000, 5000) : rand(500, 2500)
    const exp      = isPrem ? rand(1500, 4000) : rand(300, 2000)
    const sp       = isPrem ? rand(3, 8)       : rand(1, 4)

    patchUserData(sender, {
      exp:      user.exp + exp,
      money:    user.money + money,
      diamonds: user.diamonds + diamonds,
      items:    { ...user.items, sp: user.items.sp + sp },
    })
    setCooldown(sender, 'lastCofre')

    const leveled = checkLevelUp(sender)
    const lvlLine = leveled > 0 ? `\n> ◆ *¡Subiste ${leveled} nivel(es)!*` : ''

    await sock.sendMessage(jid, {
      text: `*COFRE ABIERTO* ${isPrem ? '★' : ''}

> +${exp} XP  · +¥${money} BrasCoins
> +${diamonds} Diamantes  · +${sp} Magia${lvlLine}

_Próximo cofre en 24h_`,
    }, { quoted: msg })
  },
}

export default command
