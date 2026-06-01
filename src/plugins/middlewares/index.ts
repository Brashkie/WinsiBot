import type { BotContext } from '../../types/index.js'
import { loggerMiddleware } from './logger.js'
import { rateLimitMiddleware } from './rateLimit.js'
import { cooldownMiddleware } from './cooldown.js'

type Middleware = (ctx: BotContext) => Promise<boolean>

const middlewares: Middleware[] = [
  loggerMiddleware,
  rateLimitMiddleware,
  cooldownMiddleware,
]

export async function applyMiddlewares(ctx: BotContext): Promise<boolean> {
  for (const mw of middlewares) {
    const passed = await mw(ctx)
    if (!passed) return false
  }
  return true
}