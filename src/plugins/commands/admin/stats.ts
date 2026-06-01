import type { Command } from '../../../types/index.js'
import { getBotStats, getTopCommands } from '@lib/pythonBridge.js'

const command: Command = {
  name: 'stats',
  aliases: ['estadisticas', 'estadística'],
  description: 'Estadisticas del bot',
  category: 'admin',
  ownerOnly: true,

  async execute({ sock, jid, msg }) {
    const [stats, topCmds] = await Promise.all([
      getBotStats(),
      getTopCommands(),
    ])

    if (!stats) {
      await sock.sendMessage(jid, { text: '❌ No se pudieron obtener las estadisticas.' }, { quoted: msg })
      return
    }

    const topList = topCmds
      .slice(0, 5)
      .map((c, i) => `  ${i + 1}. ${c.command} — ${c.count}x`)
      .join('\n')

    const text = `📊 *Estadisticas de WinsiBot*

👥 Usuarios: *${stats.total_users}*
💬 Mensajes totales: *${stats.total_messages}*
⚡ Comandos totales: *${stats.total_commands}*
📅 Mensajes hoy: *${stats.messages_today}*
🔥 Comandos hoy: *${stats.commands_today}*
🚫 Baneados: *${stats.banned_users}*
💎 Premium: *${stats.premium_users}*

🏆 *Top comandos:*
${topList || '  Sin datos'}`

    await sock.sendMessage(jid, { text }, { quoted: msg })
  },
}

export default command