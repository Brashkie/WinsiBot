import type { WASocket, WAMessage } from '@whiskeysockets/baileys'
import type { Command } from '../../../types/index.js'
import { getUserData, patchUserData } from '@core/events.js'
import { logger } from '@core/logger.js'
import { safeSend, sendCritical } from '@lib/media_sender.js'
import { ApuestasAbiertas } from '@lib/apuestasAbiertas.js'
import {
  type Carta, mazo, mostrar, mejorMano, nombreMano, resolver,
} from '@lib/poker.js'

// Casino Hold'em contra la casa (ver poker.ts). Igual que #bj: lo apostado se
// descuenta al apostar y se anota en data/poker.json, para devolverlo si un
// reinicio corta la mano (ver apuestasAbiertas.ts).

const MIN_ANTE = 10
const MAX_ANTE = 200_000    // la ida es el doble: hasta ¥600.000 en la mesa
const INACTIVA = 2 * 60_000 // sin decidir en 2 min, se retira solo

const abiertas = new ApuestasAbiertas('poker')

interface Mano {
  jid:     string
  ante:    number
  jugador: Carta[]
  crupier: Carta[]
  mesa:    Carta[]          // las 5; se muestran 3 hasta que decide
  timer?:  NodeJS.Timeout
}

const mesas = new Map<string, Mano>()   // sender → mano

const anotar = () => abiertas.anotar([...mesas].map(([s, h]) => [s, h.ante]))

/** Ver apuestasAbiertas.ts. La llama el 'ready' de index.ts. */
export const devolverManosInterrumpidas = () => abiertas.devolver()

function pantalla(h: Mano): string {
  const flop = h.mesa.slice(0, 3)
  return [
    `╭─「 ♠️ CASINO HOLD'EM 」  ante ¥${h.ante.toLocaleString()}`,
    `│`,
    `│ Mesa:    ${mostrar(flop)}  🂠 🂠`,
    `│ Tú:      ${mostrar(h.jugador)}  → ${nombreMano(mejorMano([...h.jugador, ...flop]).valor)}`,
    `│ Crupier: 🂠 🂠`,
  ].join('\n')
}

const ETIQUETA = {
  'no-califica': '😮 *El crupier no califica* (necesita par de 4). El ante paga, la ida se devuelve',
  gana:          '✅ *¡Ganaste!*',
  empate:        '🤝 *Empate.* Recuperas todo',
  pierde:        '❌ *Gana el crupier.*',
} as const

async function retirarse(sock: WASocket, sender: string, h: Mano, quoted?: WAMessage, nota = ''): Promise<void> {
  clearTimeout(h.timer)
  mesas.delete(sender)
  anotar()
  await sendCritical(sock, h.jid, {
    text: [
      `╭─「 ♠️ CASINO HOLD'EM 」`,
      `│`,
      `│ Mesa:    ${mostrar(h.mesa)}`,
      `│ Crupier: ${mostrar(h.crupier)}  → ${nombreMano(mejorMano([...h.crupier, ...h.mesa]).valor)}`,
      `│`,
      `│ 🏳️ Te retiraste: pierdes el ante (-¥${h.ante.toLocaleString()})`,
      `╰─${nota}`,
    ].join('\n'),
    mentions: nota ? [sender] : [],
  }, quoted ? { quoted } : {})
}

async function ir(sock: WASocket, sender: string, h: Mano, quoted: WAMessage): Promise<void> {
  clearTimeout(h.timer)
  mesas.delete(sender)
  const r = resolver(h.jugador, h.crupier, h.mesa, h.ante)
  if (r.pago > 0) patchUserData(sender, { money: getUserData(sender).money + r.pago })
  anotar()

  const neto = r.pago - h.ante * 3
  await sendCritical(sock, h.jid, {
    text: [
      `╭─「 ♠️ CASINO HOLD'EM 」  ante ¥${h.ante.toLocaleString()} · ida ¥${(h.ante * 2).toLocaleString()}`,
      `│`,
      `│ Mesa:    ${mostrar(h.mesa)}`,
      `│ Tú:      ${mostrar(h.jugador)}  → *${nombreMano(r.manoJ)}*`,
      `│ Crupier: ${mostrar(h.crupier)}  → *${nombreMano(r.manoC)}*`,
      `│`,
      `│ ${ETIQUETA[r.resultado]}${neto !== 0 ? `  ${neto > 0 ? '+' : '-'}¥${Math.abs(neto).toLocaleString()}` : ''}`,
      `│ Saldo: ¥${getUserData(sender).money.toLocaleString()}`,
      `╰─`,
    ].join('\n'),
  }, { quoted })
}

const IR       = new Set(['ir', 'voy', 'call', 'pagar', 'seguir'])
const RETIRARSE = new Set(['retirarse', 'retiro', 'fold', 'paso', 'no'])

const command: Command = {
  name:        'poker',
  aliases:     ['póker', 'holdem', 'casinoholdem'],
  description: "Casino Hold'em contra la casa  |  !poker <ante>  ·  !poker ir  ·  !poker retirarse",
  category:    'rpg',
  cooldown:    2,

  async execute({ sock, jid, msg, sender, pushName, args, prefix }) {
    const sub = (args[0] ?? '').toLowerCase()
    const responder = (text: string) => safeSend(() => sock.sendMessage(jid, { text }, { quoted: msg }))
    const h = mesas.get(sender)

    if (IR.has(sub) || RETIRARSE.has(sub)) {
      if (!h) {
        await responder(`> No tienes una mano abierta. Empieza con \`${prefix}poker <ante>\`.`)
        return
      }
      if (h.jid !== jid) {
        await responder(`> Tu mano está abierta en otro chat. Termínala allá.`)
        return
      }
      if (RETIRARSE.has(sub)) {
        await retirarse(sock, sender, h, msg)
        return
      }
      const u = getUserData(sender, pushName)
      const ida = h.ante * 2
      if (u.money < ida) {
        await responder(`> Para ir necesitas ¥${ida.toLocaleString()} (tienes ¥${u.money.toLocaleString()}). Puedes retirarte con \`${prefix}poker retirarse\`.`)
        return
      }
      // Cobrar la ida y pagar el resultado pasan en el mismo tick (ir() no
      // espera nada antes de pagar): no hay un reinicio posible entre medio.
      patchUserData(sender, { money: u.money - ida })
      await ir(sock, sender, h, msg)
      return
    }

    if (h) {
      await responder(`${pantalla(h)}\n│\n╰─ Ya tienes una mano: \`${prefix}poker ir\` (¥${(h.ante * 2).toLocaleString()}) · \`${prefix}poker retirarse\``)
      return
    }

    const ante = parseInt((args[0] ?? '').replace(/[.,_]/g, ''))
    if (!Number.isFinite(ante) || ante < MIN_ANTE) {
      await responder([
        `╭─「 ♠️ CASINO HOLD'EM 」`,
        `│`,
        `│ \`${prefix}poker <ante>\` — recibes 2 cartas y se ven 3 de la mesa`,
        `│ \`${prefix}poker ir\` — pagas el doble del ante y se ve todo`,
        `│ \`${prefix}poker retirarse\` — pierdes el ante`,
        `│`,
        `│ Mejor mano de 5 entre tus 2 y las 5 de la mesa.`,
        `│ El crupier juega con par de 4 o más; si no, tu ante`,
        `│ paga y la ida se devuelve. Si juega y le ganas: ida 1:1.`,
        `│`,
        `│ *El ante paga:* escalera real 100:1 · escalera de color`,
        `│ 20:1 · póker 10:1 · full 3:1 · color 2:1 · resto 1:1`,
        `│`,
        `╰─ Ante de ¥${MIN_ANTE} a ¥${MAX_ANTE.toLocaleString()}; necesitas el triple para poder ir`,
      ].join('\n'))
      return
    }
    if (ante > MAX_ANTE) {
      await responder(`> El ante máximo es ¥${MAX_ANTE.toLocaleString()}.`)
      return
    }
    const u = getUserData(sender, pushName)
    if (u.money < ante) {
      await responder(`> No tienes suficiente (tienes ¥${u.money.toLocaleString()}).`)
      return
    }

    patchUserData(sender, { money: u.money - ante })
    const m = mazo()
    const nueva: Mano = {
      jid, ante,
      jugador: [m.pop()!, m.pop()!],
      crupier: [m.pop()!, m.pop()!],
      mesa:    [m.pop()!, m.pop()!, m.pop()!, m.pop()!, m.pop()!],
    }
    mesas.set(sender, nueva)
    anotar()
    nueva.timer = setTimeout(() => {
      if (mesas.get(sender) !== nueva) return
      void retirarse(sock, sender, nueva, undefined, ` @${sender.split('@')[0]} no decidió en 2 min: se retiró solo.`)
        .catch(err => logger.warn({ err }, 'poker: no se pudo cerrar la mano inactiva'))
    }, INACTIVA)
    nueva.timer.unref()

    await responder(`${pantalla(nueva)}\n│\n╰─ \`${prefix}poker ir\` (¥${(ante * 2).toLocaleString()}) · \`${prefix}poker retirarse\``)
  },
}

export default command
