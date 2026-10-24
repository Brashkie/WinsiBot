// Póker: el evaluador de manos y las reglas de Casino Hold'em. Lógica pura;
// la usa #poker y se prueba desde scripts/poker.test.js.
//
// Casino Hold'em es el Hold'em de casino, contra la casa: el jugador pone un
// ante y recibe dos cartas, se ven las tres primeras de la mesa (el flop), y
// decide si VA —pagando el doble del ante— o se retira y pierde el ante. Se
// completan turn y river; el crupier CALIFICA con par de 4 o más. Si no
// califica, el ante paga según la tabla y la ida se devuelve; si califica, se
// comparan las manos y la ida paga 1:1. Ventaja de la casa ~2,2%.
//
// Se eligió en vez de una mesa entre jugadores porque esa necesita mandar las
// cartas por privado a cada uno, turnos, ciegas y botes paralelos: otro juego.

import type { Carta } from './blackjack.js'
export { mazo, mostrar, type Carta } from './blackjack.js'

export const enum Cat {
  Alta, Par, DoblePar, Trio, Escalera, Color, Full, Poker, EscaleraColor,
}

export const NOMBRE_CAT = [
  'Carta alta', 'Par', 'Doble par', 'Trío', 'Escalera', 'Color', 'Full', 'Póker', 'Escalera de color',
]

/** [categoría, desempates…]: se comparan como tuplas. El As vale 14 (y 1 en A-2-3-4-5). */
export type Valor = number[]

const alto = (c: Carta) => (c.r === 1 ? 14 : c.r)

export function evaluar5(cartas: Carta[]): Valor {
  const rs = cartas.map(alto).sort((a, b) => b - a)
  const color = cartas.every(c => c.p === cartas[0]!.p)

  const unicos = [...new Set(rs)]
  let escalera = 0
  if (unicos.length === 5) {
    if (rs[0]! - rs[4]! === 4) escalera = rs[0]!
    else if (rs.join() === '14,5,4,3,2') escalera = 5   // A-2-3-4-5: la más baja
  }

  // Grupos por cantidad y después por rango: [[3, 9], [2, 4]] para un full.
  const cuenta = new Map<number, number>()
  for (const r of rs) cuenta.set(r, (cuenta.get(r) ?? 0) + 1)
  const grupos = [...cuenta].sort((a, b) => b[1] - a[1] || b[0] - a[0])
  const orden = grupos.map(g => g[0])
  const forma = grupos.map(g => g[1]).join('')

  if (escalera && color) return [Cat.EscaleraColor, escalera]
  if (forma === '41') return [Cat.Poker, ...orden]
  if (forma === '32') return [Cat.Full, ...orden]
  if (color) return [Cat.Color, ...rs]
  if (escalera) return [Cat.Escalera, escalera]
  if (forma === '311') return [Cat.Trio, ...orden]
  if (forma === '221') return [Cat.DoblePar, ...orden]
  if (forma === '2111') return [Cat.Par, ...orden]
  return [Cat.Alta, ...rs]
}

export function comparar(a: Valor, b: Valor): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0)
    if (d) return d
  }
  return 0
}

/** La mejor mano de 5 entre 5, 6 o 7 cartas (21 combinaciones con 7). */
export function mejorMano(cartas: Carta[]): { valor: Valor; cartas: Carta[] } {
  let mejor: { valor: Valor; cartas: Carta[] } | null = null
  const elegidas: Carta[] = []
  const recorrer = (desde: number) => {
    if (elegidas.length === 5) {
      const v = evaluar5(elegidas)
      if (!mejor || comparar(v, mejor.valor) > 0) mejor = { valor: v, cartas: [...elegidas] }
      return
    }
    for (let i = desde; i <= cartas.length - (5 - elegidas.length); i++) {
      elegidas.push(cartas[i]!)
      recorrer(i + 1)
      elegidas.pop()
    }
  }
  recorrer(0)
  return mejor!
}

export function nombreMano(v: Valor): string {
  if (v[0] === Cat.EscaleraColor && v[1] === 14) return 'Escalera real'
  return NOMBRE_CAT[v[0]!]!
}

/** Lo que paga el ante cuando gana el jugador (o el crupier no califica). */
export function pagoAnte(v: Valor): number {
  if (v[0] === Cat.EscaleraColor) return v[1] === 14 ? 100 : 20
  if (v[0] === Cat.Poker) return 10
  if (v[0] === Cat.Full) return 3
  if (v[0] === Cat.Color) return 2
  return 1
}

/** El crupier juega con par de 4 o más. */
export function califica(v: Valor): boolean {
  return v[0]! > Cat.Par || (v[0] === Cat.Par && v[1]! >= 4)
}

export type Resultado = 'no-califica' | 'gana' | 'empate' | 'pierde'

/**
 * El final de una mano en la que el jugador FUE. `ante` es el ante; la ida es
 * el doble. `pago` es lo que se le DEVUELVE, apuestas incluidas (las dos ya se
 * descontaron).
 */
export function resolver(jugador: Carta[], crupier: Carta[], mesa: Carta[], ante: number): {
  resultado: Resultado; pago: number; manoJ: Valor; manoC: Valor
} {
  const manoJ = mejorMano([...jugador, ...mesa]).valor
  const manoC = mejorMano([...crupier, ...mesa]).valor
  const ida = ante * 2
  const anteGana = ante + ante * pagoAnte(manoJ)

  if (!califica(manoC)) return { resultado: 'no-califica', pago: anteGana + ida, manoJ, manoC }
  const c = comparar(manoJ, manoC)
  if (c > 0) return { resultado: 'gana', pago: anteGana + ida * 2, manoJ, manoC }
  if (c === 0) return { resultado: 'empate', pago: ante + ida, manoJ, manoC }
  return { resultado: 'pierde', pago: 0, manoJ, manoC }
}
