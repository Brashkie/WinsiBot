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
  const limited: WASocket['sendMessage'] = ((jid: any, content: any, options: any) =>
    rateLimiter.directForJid(String(jid ?? ''), () => original(jid, content, options))
  ) as WASocket['sendMessage']

  sock.sendMessage = limited
  s[WRAPPED] = true

  logger.debug({ label }, 'embudo de salida activo — sendMessage pasa por el rate limiter')
  return sock
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
