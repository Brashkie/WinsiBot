import pino from 'pino'
import { config } from '@config'

const BAD_MAC_PATTERNS = [
  'Bad MAC', 'Failed to decrypt', 'Session error',
  'verifyMAC', 'decryptWhisperMessage', 'libsignal',
]

function isSuppressed(msg: string): boolean {
  return BAD_MAC_PATTERNS.some(p => msg?.includes(p))
}

export const logger = config.isDev
  ? pino({
      level: config.logLevel,
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:HH:MM:ss',
          ignore: 'pid,hostname',
        },
      },
      hooks: {
        logMethod(args, method) {
          const first = args[0] as Record<string, any>
          const msg = String(first?.err?.message ?? first?.msg ?? first ?? '')
          if (isSuppressed(msg)) return
          method.apply(this, args as any)
        }
      }
    })
  : pino({ level: config.logLevel })