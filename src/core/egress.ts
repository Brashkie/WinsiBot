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
import { completar } from '@lib/mentions.js'
import { leerJid, tapar, type Numero } from '@lib/phoneGuard.js'
import { esDueno } from '@lib/owner.js'
import { config } from '@config'
import { winsiStore } from './store.js'
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
    // Un "@<número>" del texto que alguien mencionó, como mención de verdad:
    // si no, WhatsApp muestra el número crudo (ver lib/mentions.ts).
    const conMenciones = completar(content)
    // El texto viaja con el turno: vuelve con los números que tiene, que Ada
    // encontró y tapó, sin una petición más.
    const texto = textoDe(conMenciones)
    const numeros = await antibanTurn(label, to, texto?.valor)
    const seguro = texto ? protegerNumeros(conMenciones, texto, numeros, to) : conMenciones
    return rateLimiter.directForJid(to, () => original(jid, seguro, options))
  }) as WASocket['sendMessage']

  sock.sendMessage = limited
  s[WRAPPED] = true

  logger.debug({ label }, 'embudo de salida activo — sendMessage pasa por el rate limiter')
  return sock
}

/** Los motivos del antiban (antiban.rs, `Motivo`), para el log. */
const MOTIVOS: Record<string, string> = {
  calentamiento: 'número nuevo en calentamiento, ya mandó lo de hoy (#antiban)',
  dia: 'llegó al tope de 24 h',
  hora: 'llegó al tope por hora',
  minuto: 'llegó al tope por minuto',
  enfriamiento: 'WhatsApp pidió bajar el ritmo (429)',
  contacto463: 'WhatsApp no entrega a este contacto por ahora (463)',
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
async function antibanTurn(account: string, jid: string, texto?: string): Promise<Numero[] | null> {
  const turn = await sessionClient.antibanPermit(account, jid, texto)
  if (!turn) return null
  if (!turn.send) {
    // Qué lo frena y a qué hora vuelve, en palabras: "retryInMs: 82264044" no
    // le decía nada a nadie, y el bot parecía roto.
    const vuelve = new Date(Date.now() + turn.retryInMs).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })
    const porque = MOTIVOS[turn.reason] ?? turn.reason
    logger.warn({ account, jid, reason: turn.reason }, `antiban: no sale — ${porque}; vuelve a enviar a las ${vuelve}`)
    throw new AntibanRejected(turn.reason, turn.retryInMs)
  }
  if (turn.waitMs > 0) {
    if (turn.waitMs > 5_000) {
      logger.info({ account, jid, reason: turn.reason, waitMs: turn.waitMs }, 'antiban: envío demorado')
    }
    await new Promise<void>((r) => setTimeout(r, turn.waitMs))
  }
  return turn.numeros ?? null
}

/** El texto de un mensaje, si tiene: el de un texto o el pie de una foto. */
function textoDe(content: any): { campo: 'text' | 'caption'; valor: string } | null {
  if (typeof content?.text === 'string' && content.text) return { campo: 'text', valor: content.text }
  if (typeof content?.caption === 'string' && content.caption) return { campo: 'caption', valor: content.caption }
  return null
}

/**
 * El mensaje con los números de la gente tapados (ver lib/phoneGuard.ts).
 *
 * No se tapan: en el privado con el owner, nada —los necesita para moderar—;
 * en cualquier privado, el número de quien lo recibe; y los mencionados de
 * verdad, que WhatsApp muestra con el nombre. `numeros` es lo que encontró
 * Ada en la Session API; si no contestó, se buscan acá con la misma regla.
 */
function protegerNumeros(content: any, texto: { campo: 'text' | 'caption'; valor: string },
                         numeros: Numero[] | null, to: string): any {
  const privado = !to.endsWith('@g.us')
  const pn = privado ? winsiStore.resolveJid(to).jid : ''
  if (privado && esDueno(pn || to, '', config.ownerJid)) return content

  const permitidos = new Set<string>()
  for (const j of [privado ? to : '', pn, ...(Array.isArray(content?.mentions) ? content.mentions : [])]) {
    const n = typeof j === 'string' ? leerJid(j) : null
    if (n) permitidos.add(n.numero)
  }
  const nuevo = tapar(texto.valor, numeros, permitidos)
  return nuevo === texto.valor ? content : { ...content, [texto.campo]: nuevo }
}

