import { Hono } from 'hono'
import { buildStatsReport } from '@lib/botStatsReport.js'
import { subBots } from '@plugins/commands/jadibot/serbot.js'

export const adminRoutes = new Hono()

// Las cifras vienen de buildStatsReport (userData en memoria + contadores de
// Rust), no de Python. Ver lib/botStatsReport.ts para la fuente de cada una.
adminRoutes.get('/stats', async (c) => {
  const s = await buildStatsReport()
  const activeSubbots = [...subBots.values()].filter(b => b.status === 'connected').length

  return c.json({
    totalUsers:    s.total_users,
    totalMessages: s.total_messages,
    totalCommands: s.total_commands,
    messagesToday: s.messages_today,
    commandsToday: s.commands_today,
    bannedUsers:   s.banned_users,
    premiumUsers:  s.premium_users,
    activeSubbots,
    topCommands:   s.top_commands,
  })
})
