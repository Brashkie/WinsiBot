import type { Command } from '../../../types/index.js'
import { getUserData, getUserClan, expForLevel } from '@core/events.js'

const bar = (cur: number, max: number, len = 6) => {
  const filled = Math.min(len, Math.floor((cur / max) * len))
  return `${'▓'.repeat(filled)}${'░'.repeat(len - filled)}`
}

const command: Command = {
  name: 'perfil',
  aliases: ['profile', 'miperfil', 'yo'],
  description: 'Ver perfil propio o de otro (@mencionar)',
  category: 'rpg',
  cooldown: 5,
  register: true,

  async execute({ sock, jid, msg, sender, pushName }) {
    const target = (msg.message?.extendedTextMessage?.contextInfo?.mentionedJid ?? [])[0] ?? sender
    const user   = getUserData(target, pushName)
    const clan   = getUserClan(target)
    const need   = expForLevel(user.level)
    const num    = target.split('@')[0]

    const lines: string[] = [
      `*${user.name || pushName}*  +${num}`,
      `_Nv.${user.level} · ${user.profile.role}_`,
      '',
      `> XP  ${user.exp}/${need}  ${bar(user.exp, need)}`,
      `> ¥${user.money}  Banco ¥${user.bank}  💎 ${user.diamonds}`,
      `> ❤ ${user.health}/100  🔥 ${user.crime} crimen`,
    ]

    if (user.profile.description)
      lines.push(`> _"${user.profile.description}"_`)

    if (clan)
      lines.push(`> [${clan.tag}] ${clan.name}  Nv.${clan.level}`)

    if (user.profile.marry)
      lines.push(`> 💍 @${user.profile.marry.split('@')[0]}`)

    if (user.profile.afk > 0)
      lines.push(`> 💤 AFK${user.profile.afkReason ? ` — ${user.profile.afkReason}` : ''}`)

    if (user.premium)
      lines.push('> ★ _Premium_')

    lines.push('', `_${user.registered ? 'registrado' : 'no registrado'}_`)

    const mentions = [target]
    if (user.profile.marry) mentions.push(user.profile.marry)

    await sock.sendMessage(jid, { text: lines.join('\n'), mentions }, { quoted: msg })
  },
}

export default command
