import type { Command } from '../../../types/index.js'
import { buildStatsReport } from '@lib/botStatsReport.js'
import { safeSend } from '@lib/media_sender.js'
import { config } from '@config'

const command: Command = {
  name: 'stats',
  aliases: ['estadisticas', 'estadística'],
  description: 'Estadisticas del bot',
  category: 'admin',
  ownerOnly: true,

  async execute({ sock, jid, msg }) {
    const s = await buildStatsReport(5)

    const topList = s.top_commands
      .slice(0, 5)
      .map((c, i) => `  ${i + 1}. ${c.command} — ${c.count}x`)
      .join('\n')

    const text = `📊 *Estadisticas de ${config.botName}*

👥 Usuarios: *${s.total_users}*
💬 Mensajes totales: *${s.total_messages}*
⚡ Comandos totales: *${s.total_commands}*
📅 Mensajes hoy: *${s.messages_today}*
🔥 Comandos hoy: *${s.commands_today}*
🚫 Baneados: *${s.banned_users}*
💎 Premium: *${s.premium_users}*

🏆 *Top comandos:*
${topList || '  Sin datos'}${s.degraded ? '\n\n_⚠ Contadores no disponibles — solo se muestran los datos de usuarios_' : ''}`

    await safeSend(() => sock.sendMessage(jid, { text }, { quoted: msg }))
  },
}

export default command
