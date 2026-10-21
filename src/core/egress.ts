// ─────────────────────────────────────────────────────────────────────────────
//  WinsiBot — EMBUDO DE SALIDA
//
//  El bot tenía un rate limiter bien hecho —techo global, bucket por chat,
//  retraso mínimo, backoff cuando WhatsApp pide bajar el ritmo— que en la
//  práctica cubría el 38% de los envíos. El otro 62% (524 llamadas) iba por
//  `sock.sendMessage` directo, sin pasar por ningún control: comandos,
//  bienvenidas, avisos de moderación, respuestas de juegos.
//
//  Y el límite POR CHAT —el que evita floodear un grupo concreto, justo el
//  patrón que WhatsApp lee como abuso— casi nunca llegaba a aplicarse: solo lo
//  usaba `enqueueSend`, que a su vez solo usaba `broadcastSend`.
//
//  Convertir 524 llamadas a mano sería enorme y frágil (y la 525 volvería a
//  colarse). En vez de eso se envuelve `sendMessage` UNA vez, justo después de
//  crear el socket: todo lo que salga del bot pasa por el limitador, se haya
//  escrito con safeSend o sin él, hoy o dentro de seis meses.
//
//  Se aplica igual a los sub-bots (ver serbot.ts): cada uno tiene su propio
//  socket, y todos comparten el mismo limitador — el techo es de la cuenta y
//  de la conexión, no de cada instancia por separado.
// ─────────────────────────────────────────────────────────────────────────────

import type { WASocket } from '@whiskeysockets/baileys'
import { rateLimiter } from '@lib/rateLimiter.js'
import { sessionClient } from '@lib/session.js'
import { logger } from './logger.js'

/** Marca para no envolver dos veces el mismo socket (p. ej. en reconexiones). */
const WRAPPED = Symbol.for('winsi.egress.wrapped')

/**
 * Envuelve `sock.sendMessage` para que TODO envío pase por el rate limiter.
 *
 * Devuelve el mismo socket, ya intervenido. Es idempotente: llamarlo dos veces
 * sobre el mismo socket no apila dos limitadores.
 */
export function wrapEgress(sock: WASocket, label = 'main'): WASocket {
  const s = sock as WASocket & { [WRAPPED]?: boolean }
  if (s[WRAPPED]) return sock

  const original = sock.sendMessage.bind(sock)

  // La firma se conserva exacta para que los 850 puntos de llamada no noten
  // nada: mismos argumentos, misma promesa de vuelta.
  const limited: WASocket['sendMessage'] = (async (jid: any, content: any, options: any) => {
    const to = String(jid ?? '')
    await antibanTurn(label, to)
    return rateLimiter.directForJid(to, () => original(jid, content, options))
  }) as WASocket['sendMessage']

  sock.sendMessage = limited
  s[WRAPPED] = true

  logger.debug({ label }, 'embudo de salida activo — sendMessage pasa por el rate limiter')
  return sock
}

/** Error de un envío que el antiban no dejó salir. Lleva cuándo reintentar. */
export class AntibanRejected extends Error {
  constructor(
    readonly reason: string,
    readonly retryInMs: number,
  ) {
    super(`antiban: envío rechazado (${reason}), reintentar en ${Math.round(retryInMs / 1000)}s`)
    this.name = 'AntibanRejected'
  }
}

/**
 * Espera el turno que da el antiban de Rust (rust/src/antiban.rs): topes por
 * minuto, hora y día, calentamiento de números nuevos, pausa con jitter y
 * enfriamiento tras un 429 o un 463.
 *
 * Va ANTES del limitador local y no lo reemplaza: el local sigue poniendo el
 * techo por segundo y la cubeta por chat, que son los que actúan en una
 * ráfaga; el de Rust ve las ventanas largas y lo que WhatsApp contestó.
 *
 * Si Rust no contesta, no espera nada: queda el limitador local, que es como
 * funcionaba el bot hasta ahora. Que la API se caiga no puede dejar al bot
 * sin enviar.
 */
async function antibanTurn(account: string, jid: string): Promise<void> {
  const turn = await sessionClient.antibanPermit(account, jid)
  if (!turn) return
  if (!turn.send) {
    logger.warn({ account, jid, reason: turn.reason, retryInMs: turn.retryInMs }, 'antiban: envío rechazado')
    throw new AntibanRejected(turn.reason, turn.retryInMs)
  }
  if (turn.waitMs > 0) {
    if (turn.waitMs > 5_000) {
      logger.info({ account, jid, reason: turn.reason, waitMs: turn.waitMs }, 'antiban: envío demorado')
    }
    await new Promise<void>((r) => setTimeout(r, turn.waitMs))
  }
}

/**
 * El socket sin limitar, para los pocos casos en que hay que saltárselo.
 *
 * Hoy no lo usa nadie a propósito: si algo necesita salir sin control, que sea
 * una decisión explícita y visible, no un `sock.sendMessage` más entre otros
 * quinientos.
 */
export function rawSendMessage(sock: WASocket): WASocket['sendMessage'] {
  return sock.sendMessage
}
