import type { BotContext } from '../../types/index.js'
import { safeSend } from '@lib/media_sender.js'
import { commandRegistry } from '@plugins/commands/index.js'
import { createCache, registerCache } from '@lib/cacheManager.js'
import { t } from '@lib/i18n.js'

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

  // Los alias ya son claves del registro: un solo get alcanza.
  const command = commandRegistry.get(ctx.command)

  if (!command?.cooldown) return true

  if (ctx.isOwner) return true

  // Por el nombre del comando y no por lo que se escribió: si no, cada alias
  // (#salud, #vida, #hp…) tenía su propia espera y se esquivaba cambiando de alias.
  const key       = getCooldownKey(ctx.sender, command.name)
  const remaining = cache.get(key)

  if (remaining !== undefined) {
    const secs = Math.max(1, Math.ceil((remaining - Date.now()) / 1000))
    await safeSend(() => ctx.sock.sendMessage(ctx.jid, {
      text: t(ctx.lang, 'cooldown', { s: secs, cmd: `${ctx.prefix}${ctx.command}` }),
    }, { quoted: ctx.msg })).catch(() => {})
    return false
  }

  // NodeCache tomaba el TTL en segundos como 3er argumento; acá va en ms.
  cache.set(key, Date.now() + command.cooldown * 1000, { ttl: command.cooldown * 1000 })
  return true
}
