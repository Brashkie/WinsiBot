import { Hono } from 'hono'
import { getBotStats, getTopCommands } from '@lib/pythonBridge.js'
import { subBots } from '@plugins/commands/jadibot/serbot.js'

export const adminRoutes = new Hono()

adminRoutes.get('/stats', async (c) => {
  const [stats, topCommands] = await Promise.all([getBotStats(), getTopCommands()])

  const activeSubbots = [...subBots.values()].filter(b => b.status === 'connected').length

  if (!stats) {
    return c.json({
      totalUsers: 0, totalMessages: 0, totalCommands: 0,
      messagesToday: 0, commandsToday: 0, bannedUsers: 0, premiumUsers: 0,
      activeSubbots, topCommands: [],
    })
  }

  return c.json({
    totalUsers:    stats.total_users,
    totalMessages: stats.total_messages,
    totalCommands: stats.total_commands,
    messagesToday: stats.messages_today,
    commandsToday: stats.commands_today,
    bannedUsers:   stats.banned_users,
    premiumUsers:  stats.premium_users,
    activeSubbots,
    topCommands,
  })
})
