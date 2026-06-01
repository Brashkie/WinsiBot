import type { BotContext } from '../../types/index.js'
import { safeSend } from '@lib/media_sender.js'
import { commandRegistry } from '@plugins/commands/index.js'
import NodeCache from 'node-cache'

const cache = new NodeCache({ stdTTL: 60, checkperiod: 30 })

function getCooldownKey(sender: string, command: string): string {
  return `cd:${sender}:${command}`
}

export async function cooldownMiddleware(ctx: BotContext): Promise<boolean> {
  if (!ctx.command) return true

  const command = commandRegistry.get(ctx.command)
    ?? [...commandRegistry.values()].find(c => c.aliases?.includes(ctx.command))

  if (!command?.cooldown) return true

  if (ctx.isOwner) return true

  const key       = getCooldownKey(ctx.sender, ctx.command)
  const remaining = cache.get<number>(key)

  if (remaining !== undefined) {
    const secs = Math.max(1, Math.ceil((remaining - Date.now()) / 1000))
    await safeSend(() => ctx.sock.sendMessage(ctx.jid, {
      text: `⏳ Espera *${secs}s* antes de usar \`${ctx.prefix}${ctx.command}\` de nuevo.`,
    }, { quoted: ctx.msg })).catch(() => {})
    return false
  }

  cache.set(key, Date.now() + command.cooldown * 1000, command.cooldown)
  return true
}
