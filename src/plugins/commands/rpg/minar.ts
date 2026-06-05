import type { Command } from '../../../types/index.js'
import {
  getUserData, patchUserData,
  isOnCooldown, setCooldown, getCooldownLeft, fmtCooldown,
  checkLevelUp,
} from '@core/events.js'

const CD = 10 * 60_000

const MSGS = [
  '¡Qué pro! Has minado',
  'La minería te beneficia con',
  'WOW, eres un gran minero — obtienes',
  'Tu misión se cumplió, minaste',
  'Encontraste un lugar rico y obtuviste',
  'La suerte de minar — obtienes',
]

const rand = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min
const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)]!

const command: Command = {
  name: 'minar',
  aliases: ['mine', 'minarxp', 'minarexp', 'mining'],
  description: 'Mina recursos cada 10 minutos',
  category: 'rpg',
  cooldown: 0,

  async execute({ sock, jid, msg, sender, pushName }) {
    if (isOnCooldown(sender, 'lastMining', CD)) {
      const left = getCooldownLeft(sender, 'lastMining', CD)
      await sock.sendMessage(jid, {
        text: `> ⏳ Espera *${fmtCooldown(left)}* para continuar minando.`,
      }, { quoted: msg })
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
    const lvlLine = leveled > 0 ? `\n> ◆ *¡Subiste ${leveled} nivel(es)!*` : ''

    await sock.sendMessage(jid, {
      text: `*MINERÍA* ${isPrem ? '★' : ''}

> _${pick(MSGS)} *${exp} XP*_
> +¥${money}  · +${diamonds} 💎  · +${sp} ✨${lvlLine}

_Mina de nuevo en 10 min_`,
    }, { quoted: msg })
  },
}

export default command
