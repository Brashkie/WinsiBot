// Reporte de estadísticas — la fuente de cada cifra, en un solo lugar.
//
// Antes todo venía de /api/v1/stats de Python, que leía .parquet alimentados
// con dos llamadas HTTP por mensaje. Y estaba a medias: `total_commands` y el
// top de comandos salían de `command_stats.parquet`, un archivo que nadie
// escribía nunca, así que daban 0 y vacío respectivamente.
//
// Ahora cada cifra sale de donde de verdad vive:
//
//   · usuarios (total/baneados/premium)  → userData, en memoria: exacto y sin red
//   · mensajes y comandos                → contadores en Rust (core/botStats.ts)
//   · top de comandos                    → Rust (ahora sí se alimenta)
//
// Si Rust no responde, se devuelven las cifras de usuarios igual y los
// contadores en 0: es mejor un reporte parcial que un error.

import { userData } from '@core/events.js'
import { sessionClient } from '@lib/session.js'
import { pending } from '@core/botStats.js'
import { logger } from '@core/logger.js'

export interface BotStatsReport {
  total_users:    number
  banned_users:   number
  premium_users:  number
  total_messages: number
  total_commands: number
  messages_today: number
  commands_today: number
  top_commands:   Array<{ command: string; count: number }>
  degraded:       boolean   // true si los contadores no se pudieron leer
}

export async function buildStatsReport(topLimit = 10): Promise<BotStatsReport> {
  // Usuarios: recorrer el Map en memoria. Con unos miles de entradas es
  // instantáneo, y evita mantener contadores paralelos que se desincronizan.
  let banned = 0
  let premium = 0
  const now = Date.now()
  for (const u of userData.values()) {
    if (u.banned) banned++
    if (u.premium && (u.premiumTime === 0 || u.premiumTime > now)) premium++
  }

  const base = {
    total_users:   userData.size,
    banned_users:  banned,
    premium_users: premium,
  }

  try {
    const [counters, top] = await Promise.all([
      sessionClient.statsCounters(),
      sessionClient.statsTopCommands(topLimit),
    ])
    // Sumar lo acumulado que todavía no se volcó, para no mostrar cifras con
    // hasta un minuto de retraso.
    const p = pending()
    return {
      ...base,
      total_messages: counters.total_messages + p.messages,
      total_commands: counters.total_commands + p.commands,
      messages_today: counters.messages_today + p.messages,
      commands_today: counters.commands_today + p.commands,
      top_commands:   top,
      degraded:       false,
    }
  } catch (err) {
    logger.debug({ err }, 'stats: no se pudieron leer los contadores de Rust')
    const p = pending()
    return {
      ...base,
      total_messages: p.messages,
      total_commands: p.commands,
      messages_today: p.messages,
      commands_today: p.commands,
      top_commands:   [],
      degraded:       true,
    }
  }
}
