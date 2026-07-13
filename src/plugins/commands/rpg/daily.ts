import type { Command } from '../../../types/index.js'
import {
  getUserData, patchUserData,
  isOnCooldown, setCooldown, getCooldownLeft, fmtCooldown,
  checkLevelUp, levelUpLine,
} from '@core/events.js'
import { randomNumber as rand } from '@lib/utils.js'
import { LevelingManager } from '@lib/leveling.js'

const CD = 24 * 60 * 60_000

const command: Command = {
  name: 'daily',
  aliases: ['claim', 'reclamar', 'reclamo', 'regalo'],
  description: 'Reclama tu recompensa cada 24 horas — sube con tu racha de días',
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

    // Racha de días consecutivos — comparte el mismo sistema que #prestige racha,
    // solo que ahora avanza automáticamente cada vez que reclamas el diario.
    const meta    = user.levelingMeta ?? LevelingManager.defaultMeta()
    const { broken } = LevelingManager.updateStreak(meta)
    const mult    = LevelingManager.getXpMultiplier(meta, isPrem)

    const baseExp   = isPrem ? rand(1000, 4500) : rand(500, 1800)
    const baseMoney = isPrem ? rand(800, 3500)  : rand(300, 1500)
    const exp       = Math.floor(baseExp * mult)
    const money     = Math.floor(baseMoney * mult)
    const diamonds  = isPrem ? rand(4, 12) : rand(1, 5)
    const pc        = isPrem ? rand(2, 6)  : rand(1, 3)

    patchUserData(sender, {
      exp:          user.exp + exp,
      money:        user.money + money,
      diamonds:     user.diamonds + diamonds,
      items:        { ...user.items, pc: user.items.pc + pc },
      levelingMeta: meta,
    })
    setCooldown(sender, 'lastClaim')

    const leveled  = checkLevelUp(sender)
    const lvlLine  = levelUpLine(leveled)
    const brokeLine = broken ? '\n> 💔 Perdiste tu racha anterior — empezando de nuevo' : ''

    // Vista previa del bono de mañana — incentiva volver al día siguiente
    const nextMult = LevelingManager.getXpMultiplier(
      { ...meta, streak: { ...meta.streak, days: meta.streak.days + 1 } },
      isPrem,
    )

    await sock.sendMessage(jid, {
      text: [
        `「🎴」Reclamaste tu recompensa diaria — *Día ${meta.streak.days}* 🔥${brokeLine}`,
        ``,
        `> +¥${money.toLocaleString()} BrasCoins  ·  +${exp} XP`,
        `> +${diamonds} 💎  ·  +${pc} 🧪${lvlLine}`,
        `> Bono de racha: ×${mult.toFixed(2)}`,
        ``,
        `_Día ${meta.streak.days + 1} → ×${nextMult.toFixed(2)} · vuelve en 24h_`,
      ].join('\n'),
    }, { quoted: msg })
  },
}

export default command
