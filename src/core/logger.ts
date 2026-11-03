import pino from 'pino'
import { config } from '@config'
import { jidParaLog, textoParaLog } from '@lib/phoneGuard.js'

const BAD_MAC_PATTERNS = [
  'Bad MAC', 'Failed to decrypt', 'Session error',
  'verifyMAC', 'decryptWhisperMessage', 'libsignal',
]

function isSuppressed(msg: string): boolean {
  return BAD_MAC_PATTERNS.some(p => msg?.includes(p))
}

// Los campos con un JID de persona: el número va tapado (lib/phoneGuard.ts),
// porque el log también se lee y se comparte. LOG_NUMEROS=completo lo muestra.
const CAMPOS_JID = ['sender', 'jid', 'participant', 'owner', 'from', 'to', 'remoteJid', 'target', 'user']

function taparNumeros(args: unknown[]): unknown[] {
  return args.map((a) => {
    if (typeof a === 'string') return textoParaLog(a)
    if (!a || typeof a !== 'object' || Array.isArray(a) || a instanceof Error) return a
    let copia: Record<string, unknown> | null = null
    for (const k of CAMPOS_JID) {
      const v = (a as Record<string, unknown>)[k]
      if (typeof v !== 'string') continue
      const t = jidParaLog(v)
      if (t === v) continue
      copia ??= { ...(a as Record<string, unknown>) }
      copia[k] = t
    }
    return copia ?? a
  })
}

const hooks: pino.LoggerOptions['hooks'] = {
  logMethod(args, method) {
    const first = args[0] as Record<string, any>
    const msg = String(first?.err?.message ?? first?.msg ?? first ?? '')
    if (isSuppressed(msg)) return
    method.apply(this, taparNumeros(args) as any)
  },
}

// ─── Salida legible, en el mismo hilo ────────────────────────────────────────
//
// Hasta la 8.15.0 la salida legible era `pino-pretty` como *transport*, que en
// pino corre en un HILO APARTE: un segundo motor de V8 dentro del proceso.
// Medido: +18 MB de RAM solo por existir, y 33 µs de CPU por línea entre los
// dos hilos. Y era el caso normal, porque `.env.example` trae
// NODE_ENV=development.
//
// Esto hace lo mismo —hora, nivel con color, mensaje y el resto de los campos—
// en el hilo principal: +0,3 MB y 13 µs por línea. pino ya serializó la línea;
// acá solo se le da forma.
const NIVEL: Record<number, string> = {
  10: 'TRACE', 20: 'DEBUG', 30: 'INFO', 40: 'WARN', 50: 'ERROR', 60: 'FATAL',
}
const COLOR: Record<number, string> = {
  10: '\x1b[90m', 20: '\x1b[34m', 30: '\x1b[32m', 40: '\x1b[33m', 50: '\x1b[31m', 60: '\x1b[41m',
}

const legible: pino.DestinationStream = {
  write(linea: string) {
    let o: Record<string, any>
    try {
      o = JSON.parse(linea)
    } catch {
      process.stdout.write(linea)
      return
    }
    const { level, time, msg, pid: _pid, hostname: _host, ...resto } = o
    const d = new Date(time)
    const hora = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`
    let extra = ''
    if (resto.err?.stack) {
      extra = `\n${resto.err.stack}`
      delete resto.err
    }
    if (Object.keys(resto).length) extra = ` ${JSON.stringify(resto)}${extra}`
    process.stdout.write(`[${hora}] ${COLOR[level] ?? ''}${NIVEL[level] ?? level}\x1b[39m: \x1b[36m${msg ?? ''}\x1b[39m${extra}\n`)
  },
}

export const logger = config.isDev
  ? pino({ level: config.logLevel, base: null, hooks }, legible)
  : pino({ level: config.logLevel, hooks })
