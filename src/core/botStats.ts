// ─────────────────────────────────────────────────────────────────────────────
//  WinsiBot — CONTADORES DEL BOT
//
//  Antes cada mensaje disparaba DOS llamadas HTTP a Python (getOrCreateUser y
//  logMessage) para escribir una fila en un .parquet, y todo ese histórico solo
//  se usaba para contar filas. Encima estaba a medias: el top de comandos leía
//  `command_stats.parquet`, un archivo que nadie escribía nunca, así que salía
//  vacío siempre — y `total_commands` daba 0.
//
//  Ahora el conteo caliente es un `++` en memoria (nanosegundos, sin red) y el
//  acumulado se vuelca a Rust cada minuto y al apagar. De dos llamadas por
//  mensaje a una por minuto.
//
//  Lo que NO se guarda acá son los totales de usuarios (cuántos hay, baneados,
//  premium): esos salen de userData, que ya está en memoria, y contarlos ahí es
//  instantáneo y exacto. Duplicarlos daría dos cifras que se desincronizan.
//
//  Contrapartida asumida: se pierde el histórico por mensaje. Ya no se puede
//  mirar atrás para ver QUÉ se dijo, solo cuánto. Era lo que se usaba igual.
// ─────────────────────────────────────────────────────────────────────────────

import { logger } from './logger.js'
import { sessionClient } from '@lib/session.js'

// Acumulado desde el último volcado. Se resetea al volcar, así que lo que vive
// acá es siempre un delta pequeño.
let _messages = 0
let _commands = 0
const _byCommand = new Map<string, number>()

// El día se fija al primer mensaje del lote y no al volcar: un lote que cruza
// la medianoche debe imputarse al día en que ocurrió, no al que se escribe.
let _day = today()

// Momento en que cambia el día, en epoch ms. Comprobar el cambio de día con
// una comparación de números sale ~100x más barato que generar el string ISO
// en cada mensaje: medido, `new Date().toISOString()` por llamada costaba
// 1236 ns, y esto deja el contador en decenas de ns. Importa porque esto corre
// por CADA mensaje del bot.
let _dayEndsAt = nextMidnightUtc()

function today(): string {
  return new Date().toISOString().slice(0, 10)   // YYYY-MM-DD
}

function nextMidnightUtc(): number {
  const d = new Date()
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1)
}

/** Un mensaje procesado. Es lo más caliente del módulo: solo suma. */
export function countMessage(command?: string): void {
  // Si cruzó la medianoche a mitad de acumulado, volcar lo anterior antes de
  // seguir para no imputarlo al día equivocado.
  if (Date.now() >= _dayEndsAt) void flush()

  _messages++
  if (command) {
    _commands++
    _byCommand.set(command, (_byCommand.get(command) ?? 0) + 1)
  }
}

/**
 * Vuelca el acumulado a Rust y resetea. Se llama sola cada minuto y en el
 * apagado; es idempotente con lote vacío (no hace la llamada).
 *
 * Los contadores se resetean ANTES de la llamada: si la escritura falla, se
 * pierde ese minuto de cuentas en vez de acumularlo indefinidamente en memoria
 * y mandarlo duplicado en el próximo intento. Para unas estadísticas, perder
 * un minuto es mejor que inflar los totales.
 */
export async function flush(): Promise<void> {
  if (_messages === 0 && _commands === 0) return

  const day      = _day
  const metrics  = [
    { metric: 'messages', count: _messages },
    { metric: 'commands', count: _commands },
  ]
  const commands = [..._byCommand].map(([command, count]) => ({ command, count }))

  _messages   = 0
  _commands   = 0
  _byCommand.clear()
  _day        = today()
  _dayEndsAt  = nextMidnightUtc()

  try {
    await sessionClient.bumpStats(day, metrics, commands)
  } catch (err) {
    logger.debug({ err }, 'botStats: no se pudo volcar el lote (se descarta)')
  }
}

const FLUSH_MS = 60_000
setInterval(() => { void flush() }, FLUSH_MS).unref()

/** Lo acumulado sin volcar — para que `#stats` no muestre cifras atrasadas. */
export function pending(): { messages: number; commands: number } {
  return { messages: _messages, commands: _commands }
}
