import type { Command } from '../../../types/index.js'
import {
  getUserData, patchUserData,
  isOnCooldown, setCooldown, getCooldownLeft, fmtCooldown,
  checkLevelUp,
} from '@core/events.js'

const CD = 10 * 60_000

const JOBS = [
  'Moderaste el grupo y te pagaron',
  'Hiciste delivery toda la tarde',
  'Diseñaste un logo para un cliente',
  'Vendiste artículos en el mercado',
  'Trabajaste horas extras en la oficina',
  'Ganaste un concurso de programación',
  'Ayudaste con una mudanza y te dieron',
  'Cocinaste en un restaurante toda la noche',
  'Escribiste artículos para un blog',
  'Cultivaste y vendiste la cosecha por',
  'Desarrollaste un juego y ganaste',
  'Moderaste servidores toda la tarde',
]

const rand = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min
const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)]!

const command: Command = {
  name: 'work',
  aliases: ['trabajar', 'trabajo', 'w'],
  description: 'Trabaja cada 10 minutos para ganar BrasCoins',
  category: 'rpg',
  cooldown: 0,

  async execute({ sock, jid, msg, sender, pushName }) {
    if (isOnCooldown(sender, 'lastWork', CD)) {
      const left = getCooldownLeft(sender, 'lastWork', CD)
      await sock.sendMessage(jid, {
        text: `> ⏳ Espera *${fmtCooldown(left)}* para volver a trabajar.`,
      }, { quoted: msg })
      return
    }

    const user    = getUserData(sender, pushName)
    const isPrem  = user.premium
    const earned  = isPrem ? rand(1000, 3000) : rand(300, 1500)
    const expGain = rand(50, 200)
    const job     = pick(JOBS)

    patchUserData(sender, {
      money: user.money + earned,
      exp:   user.exp + expGain,
    })
    setCooldown(sender, 'lastWork')

    const leveled = checkLevelUp(sender)
    const lvlLine = leveled > 0 ? `\n> ◆ *¡Subiste ${leveled} nivel(es)!*` : ''

    await sock.sendMessage(jid, {
      text: `*TRABAJO* ${isPrem ? '★' : ''}

> ${job} *¥${earned}*
> ✦ +${expGain} XP${lvlLine}

_Próximo trabajo en 10 min_`,
    }, { quoted: msg })
  },
}

export default command
