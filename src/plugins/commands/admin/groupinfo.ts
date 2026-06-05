import type { Command } from '../../../types/index.js'
import { getGroupConfig, getUserData, getUserClan, expForLevel } from '@core/events/index.js'

const bar = (cur: number, max: number, len = 5) => {
  const filled = Math.min(len, Math.floor((cur / max) * len))
  return `${'▓'.repeat(filled)}${'░'.repeat(len - filled)}`
}

const bool = (v: boolean) => v ? '✔' : '✗'

const command: Command = {
  name:        'groupinfo',
  aliases:     ['grupoinfo', 'gcfg'],
  description: 'Info del grupo + tu perfil en el grupo',
  category:    'admin',
  groupOnly:   true,

  async execute({ sock, jid, msg, sender, pushName }) {
    const cfg      = getGroupConfig(jid)
    const user     = getUserData(sender, pushName)
    const clan     = getUserClan(sender)
    const need     = expForLevel(user.level)
    const metadata = await sock.groupMetadata(jid)

    const admins = metadata.participants
      .filter(p => p.admin)
      .map(p => `@${p.id.replace('@s.whatsapp.net', '')}`)
      .join('  ')

    const lines: string[] = [
      `╭─「 *${metadata.subject}* 」`,
      `│ 👥 ${metadata.participants.length} miembros`,
      `│ 👮 ${admins || '—'}`,
      `│`,
      `│ ⚙️ *Configuración*`,
      `│ ${bool(cfg.antilink)}  antilink   ${bool(cfg.antispam)}  antispam`,
      `│ ${bool(cfg.welcome)}  bienvenida ${bool(cfg.muted)}  silenciado`,
      `│ ${bool(cfg.hepein)}  IA activa  ${bool(cfg.nsfw)}  nsfw`,
      `│ ${bool(cfg.modoadmin)}  modo admin ${bool(cfg.antidelete)}  antidelete`,
      `│`,
      `│ 👤 *${user.name || pushName}*  Nv.${user.level}  _${user.profile.role}_`,
      `│ XP  ${user.exp}/${need}  ${bar(user.exp, need)}`,
      `│ ¥${user.money}  💎 ${user.diamonds}  ❤ ${user.health}/100`,
    ]

    if (clan)
      lines.push(`│ [${clan.tag}] ${clan.name}  Nv.${clan.level}`)

    if (user.premium)
      lines.push(`│ ★ Premium`)

    lines.push(`╰─ _${jid}_`)

    const mentions = metadata.participants
      .filter(p => p.admin)
      .map(p => p.id)

    await sock.sendMessage(jid, { text: lines.join('\n'), mentions }, { quoted: msg })
  },
}

export default command
