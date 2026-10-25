import type { Command } from '../../../types/index.js'
import {
  getUserData, patchUserData,
  isOnCooldownDaily, setCooldown, getDailyCooldownLeft, fmtCooldown,
  checkLevelUp, levelUpLine,
} from '@core/events.js'
import { randomNumber as rand } from '@lib/utils.js'
import { sendCritical } from '@lib/media_sender.js'
import { LevelingManager } from '@lib/leveling.js'
import { tx } from '@lib/i18n.js'

const T = {
  ya:      { es: '> ⏳ Ya reclamaste hoy. Se reinicia en *{t}* (medianoche).', en: '> ⏳ You already claimed today. It resets in *{t}* (midnight).', pt: '> ⏳ Você já pegou hoje. Reinicia em *{t}* (meia-noite).' },
  racha:   { es: '\n> 💔 Perdiste tu racha anterior — empezando de nuevo', en: '\n> 💔 You lost your previous streak — starting over', pt: '\n> 💔 Você perdeu sua sequência — começando de novo' },
  brasas:  { es: '\n> +{n} BrasEmbers (¡raro!)', en: '\n> +{n} BrasEmbers (rare!)', pt: '\n> +{n} BrasEmbers (raro!)' },
  titulo:  { es: '「🎴」Reclamaste tu recompensa diaria — *Día {d}* 🔥', en: '「🎴」You claimed your daily reward — *Day {d}* 🔥', pt: '「🎴」Você pegou sua recompensa diária — *Dia {d}* 🔥' },
  bono:    { es: '> Bono de racha: ×{x}', en: '> Streak bonus: ×{x}', pt: '> Bônus de sequência: ×{x}' },
  manana:  { es: '_Día {d} → ×{x} · se reinicia a medianoche_', en: '_Day {d} → ×{x} · resets at midnight_', pt: '_Dia {d} → ×{x} · reinicia à meia-noite_' },
}

const command: Command = {
  name: 'daily',
  aliases: ['reclamo'],
  description: 'Reclama tu recompensa una vez por día — se reinicia a medianoche, sube con tu racha de días',
  category: 'rpg',
  cooldown: 0,

  async execute({ sock, jid, msg, sender, pushName, lang }) {
    if (isOnCooldownDaily(sender, 'lastClaim')) {
      const left = getDailyCooldownLeft()
      await sock.sendMessage(jid, {
        text: tx(lang, T.ya, { t: fmtCooldown(left) }),
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
    // BrasEmbers — moneda rara para comandos NSFW, chance chica acá para que
    // no dependa solo de #ascuas (ver comando dedicado)
    const embers    = Math.random() < 0.04 ? 1 : 0

    patchUserData(sender, {
      exp:          user.exp + exp,
      money:        user.money + money,
      diamonds:     user.diamonds + diamonds,
      embers:       user.embers + embers,
      items:        { ...user.items, pc: user.items.pc + pc },
      levelingMeta: meta,
    })
    setCooldown(sender, 'lastClaim')

    const leveled  = checkLevelUp(sender)
    const lvlLine  = levelUpLine(leveled, jid, lang)
    const brokeLine = broken ? tx(lang, T.racha) : ''
    const emberLine = embers > 0 ? tx(lang, T.brasas, { n: embers }) : ''

    // Vista previa del bono de mañana — incentiva volver al día siguiente
    const nextMult = LevelingManager.getXpMultiplier(
      { ...meta, streak: { ...meta.streak, days: meta.streak.days + 1 } },
      isPrem,
    )

    // sendCritical: la recompensa ya se acreditó y el cooldown diario ya se
    // consumió. Si el mensaje se pierde, el usuario cree que no reclamó y ya
    // no puede volver a hacerlo hasta mañana — el outbox lo reenvía.
    await sendCritical(sock, jid, {
      text: [
        `${tx(lang, T.titulo, { d: meta.streak.days })}${brokeLine}`,
        ``,
        `> +¥${money.toLocaleString()} BrasCoins  ·  +${exp} XP`,
        `> +${diamonds} 💎  ·  +${pc} 🧪${lvlLine}${emberLine}`,
        tx(lang, T.bono, { x: mult.toFixed(2) }),
        ``,
        tx(lang, T.manana, { d: meta.streak.days + 1, x: nextMult.toFixed(2) }),
      ].join('\n'),
    }, { quoted: msg })
  },
}

export default command
