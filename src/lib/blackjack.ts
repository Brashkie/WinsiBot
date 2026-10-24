// Blackjack: las reglas, sin estado ni WhatsApp. Lo usa #bj y se prueba
// directo desde scripts/blackjack.test.js.
//
// Reglas: un mazo de 52 barajado por mano, el crupier se planta en 17 (también
// en 17 blando), blackjack paga 3:2, se puede doblar con las dos primeras
// cartas, sin dividir ni seguro. Si el crupier tiene blackjack se ve al
// repartir, como en la mesa real: no se juega una mano ya perdida.

import { randomInt } from 'node:crypto'

export type Palo = '♠' | '♥' | '♦' | '♣'
export interface Carta { r: number; p: Palo }   // r: 1 (A) … 13 (K)

const PALOS: Palo[] = ['♠', '♥', '♦', '♣']

/** Un mazo barajado (Fisher-Yates). `azar(n)` da un entero en [0, n). */
export function mazo(azar: (n: number) => number = randomInt): Carta[] {
  const m: Carta[] = []
  for (const p of PALOS) for (let r = 1; r <= 13; r++) m.push({ r, p })
  for (let i = m.length - 1; i > 0; i--) {
    const j = azar(i + 1)
    ;[m[i], m[j]] = [m[j]!, m[i]!]
  }
  return m
}

/** El total de la mano y si es "blanda" (un As contado como 11). */
export function valor(mano: Carta[]): { total: number; blanda: boolean } {
  let total = 0
  let ases = 0
  for (const c of mano) {
    if (c.r === 1) { ases++; total += 1 }
    else total += Math.min(c.r, 10)
  }
  // Un solo As puede valer 11: dos ya serían 22.
  const blanda = ases > 0 && total + 10 <= 21
  return { total: blanda ? total + 10 : total, blanda }
}

export const esBlackjack = (mano: Carta[]) => mano.length === 2 && valor(mano).total === 21

/** El crupier pide hasta 17 o más. Modifica `mano` y `m`. */
export function juegaCrupier(mano: Carta[], m: Carta[]): void {
  while (valor(mano).total < 17) mano.push(m.pop()!)
}

export type Resultado = 'blackjack' | 'gana' | 'empate' | 'pierde' | 'pasa'

/**
 * Cómo terminó la mano y cuánto se le DEVUELVE al jugador, apuesta incluida
 * (la apuesta ya se descontó al repartir). `apuesta` es lo que hay en la mesa:
 * si dobló, ya viene doblada.
 */
export function resolver(jugador: Carta[], crupier: Carta[], apuesta: number): { resultado: Resultado; pago: number } {
  const j = valor(jugador).total
  const c = valor(crupier).total
  const bjJ = esBlackjack(jugador)
  const bjC = esBlackjack(crupier)

  if (j > 21) return { resultado: 'pasa', pago: 0 }
  if (bjJ && bjC) return { resultado: 'empate', pago: apuesta }
  if (bjJ) return { resultado: 'blackjack', pago: apuesta + Math.floor(apuesta * 1.5) }
  if (bjC) return { resultado: 'pierde', pago: 0 }
  if (c > 21 || j > c) return { resultado: 'gana', pago: apuesta * 2 }
  if (j === c) return { resultado: 'empate', pago: apuesta }
  return { resultado: 'pierde', pago: 0 }
}

const RANGO = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']

export function mostrar(mano: Carta[], ocultarSegunda = false): string {
  return mano.map((c, i) => (ocultarSegunda && i === 1 ? '🂠' : `${RANGO[c.r]}${c.p}`)).join(' ')
}
