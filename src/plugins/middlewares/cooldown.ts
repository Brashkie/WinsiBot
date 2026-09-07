import type { BotContext } from '../../types/index.js'
import { safeSend } from '@lib/media_sender.js'
import { commandRegistry } from '@plugins/commands/index.js'
import { createCache, registerCache } from '@lib/cacheManager.js'

// periodicClear:false — la limpieza global cada 20min de cacheManager
// borraría los cooldowns en curso, dejando pasar de nuevo a todo el mundo
// justo después de barrer. Cada entrada ya expira sola con su propio TTL.
const cache = registerCache(
  'cooldowns',
  createCache<number>({ ttl: 60_000, maxSize: 2_000 }),
  { periodicClear: false },
)

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
  const remaining = cache.get(key)

  if (remaining !== undefined) {
    const secs = Math.max(1, Math.ceil((remaining - Date.now()) / 1000))
    await safeSend(() => ctx.sock.sendMessage(ctx.jid, {
      text: `⏳ Espera *${secs}s* antes de usar \`${ctx.prefix}${ctx.command}\` de nuevo.`,
    }, { quoted: ctx.msg })).catch(() => {})
    return false
  }

  // NodeCache tomaba el TTL en segundos como 3er argumento; acá va en ms.
  cache.set(key, Date.now() + command.cooldown * 1000, { ttl: command.cooldown * 1000 })
  return true
}
