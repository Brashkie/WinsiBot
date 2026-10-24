import type { WASocket, WAMessage } from '@whiskeysockets/baileys'
import type { Command } from '../../../types/index.js'
import { getUserData, patchUserData } from '@core/events.js'
import { ApuestasAbiertas } from '@lib/apuestasAbiertas.js'
import { logger } from '@core/logger.js'
import { safeSend, sendCritical } from '@lib/media_sender.js'
import {
  type Carta, mazo, valor, esBlackjack, juegaCrupier, resolver, mostrar,
} from '@lib/blackjack.js'

// La apuesta se descuenta AL REPARTIR, no al terminar: si se cobrara al final,
// alguien podría apostar, transferir su saldo a otro y perder una mano que ya
// no tiene con qué pagar.
//
// Eso obliga a cuidar el otro lado: una mano viva solo existe en memoria, y si
// el bot se reinicia a la mitad, la apuesta ya descontada se perdería sin que
// el jugador hiciera nada. Por eso las apuestas abiertas también se anotan
// (ver apuestasAbiertas.ts) y al arrancar se DEVUELVEN las que quedaron.

const MIN_APUESTA = 10
const MAX_APUESTA = 500_000
const INACTIVA    = 2 * 60_000   // sin jugar en 2 min, se planta solo

const abiertas = new ApuestasAbiertas('blackjack')

interface Mano {
  jid:      string
  apuesta:  number          // lo que hay en la mesa; doblada si dobló
  jugador:  Carta[]
  crupier:  Carta[]
  m:        Carta[]
  timer?:   NodeJS.Timeout
}

const mesas = new Map<string, Mano>()   // sender → mano

const anotar = () => abiertas.anotar([...mesas].map(([s, h]) => [s, h.apuesta]))

/** Ver apuestasAbiertas.ts. La llama el 'ready' de index.ts. */
export const devolverManosInterrumpidas = () => abiertas.devolver()

function pantalla(h: Mano, fin: boolean): string {
  const vj = valor(h.jugador)
  const tj = `${vj.total}${vj.blanda && !fin ? ' (blando)' : ''}`
  const crup = fin
    ? `${mostrar(h.crupier)}  → *${valor(h.crupier).total}*`
    : `${mostrar(h.crupier, true)}`
  return [
    `╭─「 🃏 BLACKJACK 」  ¥${h.apuesta.toLocaleString()}`,
    `│`,
    `│ Crupier: ${crup}`,
    `│ Tú:      ${mostrar(h.jugador)}  → *${tj}*`,
  ].join('\n')
}

const ETIQUETA = {
  blackjack: '🎉 *¡Blackjack!* Paga 3:2',
  gana:      '✅ *¡Ganaste!*',
  empate:    '🤝 *Empate.* Recuperas tu apuesta',
  pierde:    '❌ *Perdiste.*',
  pasa:      '💥 *Te pasaste de 21.*',
} as const

/** Cierra la mano: el crupier juega si hace falta, se paga, y se avisa. */
async function terminar(sock: WASocket, sender: string, h: Mano, quoted?: WAMessage, nota = ''): Promise<void> {
  clearTimeout(h.timer)
  mesas.delete(sender)

  // Si el jugador se pasó, el crupier no necesita jugar.
  if (valor(h.jugador).total <= 21 && !esBlackjack(h.jugador)) juegaCrupier(h.crupier, h.m)
  const { resultado, pago } = resolver(h.jugador, h.crupier, h.apuesta)
  const u = getUserData(sender)
  if (pago > 0) patchUserData(sender, { money: u.money + pago })
  anotar()

  const neto = pago - h.apuesta
  // sendCritical: el saldo ya se movió; sin el mensaje el jugador no sabría
  // si ganó o perdió. El outbox lo reenvía si el proceso muere acá.
  await sendCritical(sock, h.jid, {
    text: [
      pantalla(h, true),
      `│`,
      `│ ${ETIQUETA[resultado]}${neto !== 0 ? `  ${neto > 0 ? '+' : '-'}¥${Math.abs(neto).toLocaleString()}` : ''}`,
      `│ Saldo: ¥${getUserData(sender).money.toLocaleString()}`,
      `╰─${nota}`,
    ].join('\n'),
    mentions: nota ? [sender] : [],
  }, quoted ? { quoted } : {})
}

function rearmar(sock: WASocket, sender: string, h: Mano): void {
  clearTimeout(h.timer)
  h.timer = setTimeout(() => {
    if (mesas.get(sender) !== h) return
    void terminar(sock, sender, h, undefined, ` @${sender.split('@')[0]} no jugó en 2 min: se plantó solo.`)
      .catch(err => logger.warn({ err }, 'blackjack: no se pudo cerrar la mano inactiva'))
  }, INACTIVA)
  h.timer.unref()
}

const PEDIR     = new Set(['pedir', 'hit', 'h', 'carta', 'otra'])
const PLANTARSE = new Set(['plantarse', 'plantar', 'stand', 's', 'quedarse'])
const DOBLAR    = new Set(['doblar', 'double', 'd', 'x2'])

const command: Command = {
  name:        'blackjack',
  aliases:     ['bj', '21', 'pedir', 'plantarse', 'doblar'],
  description: 'Blackjack contra el crupier  |  !bj <monto>  ·  !bj pedir | plantarse | doblar',
  category:    'rpg',
  cooldown:    2,

  async execute({ sock, jid, msg, sender, pushName, args, prefix, command: usado }) {
    // `#pedir` es lo mismo que `#bj pedir`.
    const sub = (['pedir', 'plantarse', 'doblar'].includes(usado) ? usado : (args[0] ?? '')).toLowerCase()
    const responder = (text: string) => safeSend(() => sock.sendMessage(jid, { text }, { quoted: msg }))
    const h = mesas.get(sender)

    // ─── Jugadas sobre la mano abierta ─────────────────────────────────────
    if (PEDIR.has(sub) || PLANTARSE.has(sub) || DOBLAR.has(sub)) {
      if (!h) {
        await responder(`> No tienes una mano abierta. Empieza con \`${prefix}bj <monto>\`.`)
        return
      }
      if (h.jid !== jid) {
        await responder(`> Tu mano está abierta en otro chat. Termínala allá.`)
        return
      }

      if (DOBLAR.has(sub)) {
        if (h.jugador.length !== 2) {
          await responder(`> Solo se puede doblar con las dos primeras cartas.`)
          return
        }
        const u = getUserData(sender, pushName)
        if (u.money < h.apuesta) {
          await responder(`> Para doblar necesitas ¥${h.apuesta.toLocaleString()} más (tienes ¥${u.money.toLocaleString()}).`)
          return
        }
        patchUserData(sender, { money: u.money - h.apuesta })
        h.apuesta *= 2
        anotar()
        h.jugador.push(h.m.pop()!)
        await terminar(sock, sender, h, msg)
        return
      }

      if (PEDIR.has(sub)) {
        h.jugador.push(h.m.pop()!)
        // Con 21 o más no hay nada que decidir: se pasó, o se planta.
        if (valor(h.jugador).total >= 21) {
          await terminar(sock, sender, h, msg)
          return
        }
        rearmar(sock, sender, h)
        await responder([
          pantalla(h, false),
          `│`,
          `╰─ \`${prefix}pedir\` · \`${prefix}plantarse\``,
        ].join('\n'))
        return
      }

      await terminar(sock, sender, h, msg)
      return
    }

    // ─── Mano nueva ────────────────────────────────────────────────────────
    if (h) {
      await responder([
        pantalla(h, false),
        `│`,
        `╰─ Ya tienes una mano abierta: \`${prefix}pedir\` · \`${prefix}plantarse\`${h.jugador.length === 2 ? ` · \`${prefix}doblar\`` : ''}`,
      ].join('\n'))
      return
    }

    const u = getUserData(sender, pushName)
    const crudo = (args[0] ?? '').toLowerCase()
    const apuesta = crudo === 'all' || crudo === 'todo'
      ? Math.min(u.money, MAX_APUESTA)
      : parseInt(crudo)

    if (!Number.isFinite(apuesta) || apuesta < MIN_APUESTA) {
      await responder([
        `╭─「 🃏 BLACKJACK 」`,
        `│`,
        `│ \`${prefix}bj <monto>\` — repartir`,
        `│ \`${prefix}pedir\` · \`${prefix}plantarse\` · \`${prefix}doblar\``,
        `│`,
        `│ Llega a 21 sin pasarte y gánale al crupier.`,
        `│ Ganar paga ×2, blackjack paga 3:2, empate devuelve.`,
        `│ El crupier se planta en 17.`,
        `╰─ Apuesta entre ¥${MIN_APUESTA} y ¥${MAX_APUESTA.toLocaleString()}`,
      ].join('\n'))
      return
    }
    if (apuesta > MAX_APUESTA) {
      await responder(`> La apuesta máxima es ¥${MAX_APUESTA.toLocaleString()}.`)
      return
    }
    if (u.money < apuesta) {
      await responder(`> No tienes suficiente (tienes ¥${u.money.toLocaleString()}).`)
      return
    }

    patchUserData(sender, { money: u.money - apuesta })
    const m = mazo()
    const nueva: Mano = {
      jid, apuesta, m,
      jugador: [m.pop()!, m.pop()!],
      crupier: [m.pop()!, m.pop()!],
    }
    mesas.set(sender, nueva)
    anotar()

    // Blackjack de cualquiera de los dos al repartir: la mano ya está decidida.
    if (esBlackjack(nueva.jugador) || esBlackjack(nueva.crupier)) {
      await terminar(sock, sender, nueva, msg)
      return
    }

    rearmar(sock, sender, nueva)
    await responder([
      pantalla(nueva, false),
      `│`,
      `╰─ \`${prefix}pedir\` · \`${prefix}plantarse\` · \`${prefix}doblar\``,
    ].join('\n'))
  },
}

export default command
