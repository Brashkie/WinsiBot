import type { Command } from '../../../types/index.js'
import { getUserData, expForLevel } from '@core/events.js'

const bar = (cur: number, max: number, len = 8) => {
  const filled = Math.min(len, Math.floor((cur / max) * len))
  const pct    = Math.min(100, Math.floor((cur / max) * 100))
  return `${'▓'.repeat(filled)}${'░'.repeat(len - filled)} ${pct}%`
}

const command: Command = {
  name: 'xp',
  aliases: ['exp', 'experiencia', 'stats', 'nivel'],
  description: 'Ver estadisticas RPG',
  category: 'rpg',
  cooldown: 5,

  async execute({ sock, jid, msg, sender, pushName }) {
    const target  = (msg.message?.extendedTextMessage?.contextInfo?.mentionedJid ?? [])[0] ?? sender
    const user    = getUserData(target, pushName)
    const need    = expForLevel(user.level)
    const petLine = user.pet.type !== 'none'
      ? `${user.pet.type} Nv.${user.pet.level}${user.pet.name ? ` "${user.pet.name}"` : ''}`
      : 'sin mascota'

    await sock.sendMessage(jid, {
      text: `*${user.name || pushName}*  Nv.${user.level}  _${user.profile.role}_

> XP     ${user.exp}/${need}  ${bar(user.exp, need)}
> Coins  ¥${user.money}   Banco ¥${user.bank}
> Diam.  ${user.diamonds}   Salud ${user.health}/100

> ⚔  ${user.items.sword}   🧪 ${user.items.pc}   ✨ ${user.items.sp}   🏆 ${user.items.legendary}
> 🐾 ${petLine}${user.premium ? '\n> ★ _Premium_' : ''}`,
      mentions: [target],
    }, { quoted: msg })
  },
}

export default command
