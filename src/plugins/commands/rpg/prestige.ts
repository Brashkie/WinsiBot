import type { Command } from '../../../types/index.js'
import { getUserData, patchUserData } from '@core/events.js'
import {
  LevelingManager,
  type LevelingMeta,
  MEDALS,
  PRESTIGE_LEVEL_REQUIRED,
} from '@lib/leveling.js'

function getMeta(jid: string, name: string): LevelingMeta {
  return getUserData(jid, name).levelingMeta ?? LevelingManager.defaultMeta()
}

const command: Command = {
  name:        'prestige',
  aliases:     ['prestigio', 'medallas', 'multiplicador'],
  description: 'Sistema de prestigio, medallas y multiplicadores de XP',
  category:    'rpg',
  cooldown:    3,

  async execute({ sock, jid, msg, args, sender, pushName }) {
    const user = getUserData(sender, pushName)
    const meta = getMeta(sender, pushName)
    const sub  = (args[0] ?? '').toLowerCase()

    // ── Ver perfil de leveling ────────────────────────────────────────────────
    if (!sub || sub === 'ver' || sub === 'info' || sub === 'stats') {
      const newMedals = LevelingManager.checkMedals(meta, user.level)
      patchUserData(sender, { levelingMeta: meta })

      let text = LevelingManager.formatProfile(meta, user.level, user.premium)
      if (newMedals.length) {
        text += `\n\n🎖️ *¡Nuevas medallas desbloqueadas!*\n${newMedals.map(m => `${m.emoji} ${m.name}`).join('\n')}`
      }
      await sock.sendMessage(jid, { text }, { quoted: msg })
      return
    }

    // ── Subir de prestigio ────────────────────────────────────────────────────
    if (sub === 'subir' || sub === 'up' || sub === 'ascender') {
      if (meta.prestige.level >= 10) {
        await sock.sendMessage(jid, { text: `✨ Ya tienes el *prestigio máximo* (10). ¡Eres un *TRASCENDIDO*!` }, { quoted: msg })
        return
      }

      if (!LevelingManager.canPrestige(user.level)) {
        await sock.sendMessage(jid, {
          text: `❌ Necesitas *nivel ${PRESTIGE_LEVEL_REQUIRED}* para prestigiar.\nTu nivel actual: ${user.level}`,
        }, { quoted: msg })
        return
      }

      const { newMeta, bonusXp } = LevelingManager.doPrestige(meta, user.exp)
      const newPrestigeLevel = newMeta.prestige.level
      const title            = LevelingManager.prestigeTitle(newPrestigeLevel)

      patchUserData(sender, {
        level:       0,
        exp:         bonusXp,
        levelingMeta: newMeta,
      })

      await sock.sendMessage(jid, {
        text: [
          `✨ *¡PRESTIGIO ${newPrestigeLevel}!*`,
          `Título: *${title}*`,
          '',
          `Has reseteado al nivel 0 y recibido:`,
          `⭐ +${bonusXp} XP de inicio`,
          `📈 Multiplicador permanente: ×${newMeta.prestige.bonusRate.toFixed(1)}`,
          '',
          `_Todas tus estadísticas de batalla y monedas se mantienen._`,
        ].join('\n'),
      }, { quoted: msg })
      return
    }

    // ── Ver medallas ──────────────────────────────────────────────────────────
    if (sub === 'medallas' || sub === 'badges') {
      const newOnes = LevelingManager.checkMedals(meta, user.level)
      patchUserData(sender, { levelingMeta: meta })

      const lines = [`*🏅 MEDALLAS DE ${pushName.toUpperCase()}*`, '']
      for (const medal of MEDALS) {
        const owned = meta.medals.includes(medal.id)
        lines.push(`${owned ? medal.emoji : '⬜'} ${medal.name}${owned ? '' : ' _(bloqueada)_'}\n   _${medal.desc}_`)
      }
      if (newOnes.length) {
        lines.push('', `🎉 *Nuevas: ${newOnes.map(m => m.name).join(', ')}*`)
      }
      await sock.sendMessage(jid, { text: lines.join('\n') }, { quoted: msg })
      return
    }

    // ── Ver streak ────────────────────────────────────────────────────────────
    if (sub === 'racha' || sub === 'streak') {
      const { gained, broken } = LevelingManager.updateStreak(meta)
      patchUserData(sender, { levelingMeta: meta })

      const lines = [
        `*🔥 RACHA DE ACTIVIDAD*`,
        '',
        `Días seguidos: *${meta.streak.days}*`,
        `Mejor racha: *${meta.streak.best}*`,
      ]
      if (gained) lines.push(broken ? `\n_¡Tu racha anterior se rompió y reinició en 1!_` : `\n✅ ¡Racha actualizada hoy!`)
      await sock.sendMessage(jid, { text: lines.join('\n') }, { quoted: msg })
      return
    }

    // ── Ayuda ─────────────────────────────────────────────────────────────────
    await sock.sendMessage(jid, {
      text: `*⭐ SISTEMA DE PRESTIGIO*

> !prestige — Ver tu perfil de leveling
> !prestige subir — Prestigiar (requiere nivel ${PRESTIGE_LEVEL_REQUIRED})
> !prestige medallas — Ver todas las medallas
> !prestige racha — Ver tu racha de actividad

_El prestigio resetea tu nivel a 0 pero da un multiplicador permanente de XP y bonus especiales._

*Multiplicadores activos:*
• Prestigio: +10% por nivel de prestigio
• Premium: ×1.5
• Fin de semana: ×1.5
• Racha 3+ días: ×1.1
• Racha 7+ días: ×1.2`,
    }, { quoted: msg })
  },
}

export default command
