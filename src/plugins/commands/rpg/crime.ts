import type { Command } from '../../../types/index.js'
import {
  getUserData, patchUserData,
  isOnCooldown, setCooldown, getCooldownLeft, fmtCooldown,
  checkLevelUp,
} from '@core/events.js'

const CD = 60 * 60_000

const WIN = [
  'Robaste un banco',
  'Negociaste con la mafia',
  'Casi te atrapa la policía — lograste robar',
  'Los mafiosos te pagaron',
  'Robaste al admin del grupo',
  'Asaltaste un tren',
  'Entraste al museo sin que nadie te vea',
  'Le cobraste el rescate a un empresario',
]

const LOSE = [
  'La policía te vio — arrestado',
  'Tu cómplice te delató',
  'No pudiste escapar — detenido',
  'Intentaste robar un casino — descubierto',
  'La alarma sonó al entrar',
  'El dueño te atrapó in fraganti',
  'Intentaste hackear una cuenta — rastreado',
]

const rand = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min
const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)]!

const command: Command = {
  name: 'crime',
  aliases: ['crimen', 'delito'],
  description: 'Comete un crimen — gana o pierde (1h cooldown)',
  category: 'rpg',
  cooldown: 0,
  groupOnly: true,
  register: true,

  async execute({ sock, jid, msg, sender, pushName }) {
    if (isOnCooldown(sender, 'lastCrime', CD)) {
      const left = getCooldownLeft(sender, 'lastCrime', CD)
      await sock.sendMessage(jid, {
        text: `> La policía está vigilando. Vuelve en *${fmtCooldown(left)}*.`,
      }, { quoted: msg })
      return
    }

    const user    = getUserData(sender, pushName)
    const isPrem  = user.premium
    const success = Math.random() < (isPrem ? 0.65 : 0.5)

    setCooldown(sender, 'lastCrime')

    if (success) {
      const exp    = rand(500, 5000)
      const money  = rand(500, 5000)
      const choice = Math.floor(Math.random() * 3)

      if (choice === 0) {
        patchUserData(sender, { exp: user.exp + exp })
        const lvlLine = checkLevelUp(sender) > 0 ? '\n> ◆ *¡Subiste de nivel!*' : ''
        await sock.sendMessage(jid, {
          text: `*CRIMEN* ✓\n\n> _${pick(WIN)}_\n> +${exp} XP${lvlLine}\n\n_Próximo en 1h_`,
        }, { quoted: msg })
      } else if (choice === 1) {
        const diamonds = rand(5, 50)
        patchUserData(sender, { diamonds: user.diamonds + diamonds, money: user.money + money })
        await sock.sendMessage(jid, {
          text: `*CRIMEN* ✓\n\n> _${pick(WIN)}_\n> +${diamonds} 💎  · +¥${money}\n\n_Próximo en 1h_`,
        }, { quoted: msg })
      } else {
        patchUserData(sender, { money: user.money + money })
        await sock.sendMessage(jid, {
          text: `*CRIMEN* ✓\n\n> _${pick(WIN)}_\n> +¥${money} BrasCoins\n\n_Próximo en 1h_`,
        }, { quoted: msg })
      }
    } else {
      const loss = rand(100, Math.min(2000, user.money))
      const xpLoss = rand(50, 300)
      patchUserData(sender, {
        money: Math.max(0, user.money - loss),
        exp:   Math.max(0, user.exp - xpLoss),
      })
      await sock.sendMessage(jid, {
        text: `*CRIMEN* ✗\n\n> _${pick(LOSE)}_\n> -¥${loss}  · -${xpLoss} XP\n\n_Próximo en 1h_`,
      }, { quoted: msg })
    }
  },
}

export default command
