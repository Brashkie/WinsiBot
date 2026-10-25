// Cría de dragones: qué especie sale de cruzar dos. Lógica pura sobre el
// catálogo; la usa `#pet criar` y se prueba desde scripts/breeding.test.js.
//
// En Dragon City la cría sale de los elementos de los padres. En este
// catálogo 570 de los 579 dragones tienen CUATRO elementos, así que "solo
// elementos de los padres" casi nunca tendría candidatos. Lo que se usa es
// afinidad: la cría comparte al menos un elemento con cada padre, y cuantos
// más comparta con los dos, más probable. Las rarezas escasas del catálogo
// (Mítico, Heroico) salen menos. Y como en el juego, a veces sale la especie
// de uno de los padres.

export interface DefCria { id: number; name: string; rarity: string; elements: string[] }

export const NIVEL_MIN = 10
export const COSTO_ORO = 5000
export const COSTO_DINERO = 3000
export const ESPERA = 8 * 3_600_000

const PESO_RAREZA: Record<string, number> = {
  Legendary: 1, Legend: 1, Epic: 1, Mythical: 0.4, Heroic: 0.2,
}
const PROB_PADRE = 0.3

/** Los candidatos y su peso: comparte con los dos padres. */
export function candidatos<T extends DefCria>(a: T, b: T, catalogo: T[]): Array<{ def: T; peso: number }> {
  const ea = new Set(a.elements)
  const eb = new Set(b.elements)
  const out: Array<{ def: T; peso: number }> = []
  for (const d of catalogo) {
    const conA = d.elements.filter(e => ea.has(e)).length
    const conB = d.elements.filter(e => eb.has(e)).length
    if (conA === 0 || conB === 0) continue
    const union = d.elements.filter(e => ea.has(e) || eb.has(e)).length
    out.push({ def: d, peso: union * union * (PESO_RAREZA[d.rarity] ?? 0.5) })
  }
  return out
}

/** La especie que nace. `azar()` da un número en [0, 1). */
export function elegirCria<T extends DefCria>(a: T, b: T, catalogo: T[], azar: () => number = Math.random): T {
  if (azar() < PROB_PADRE) return azar() < 0.5 ? a : b
  const c = candidatos(a, b, catalogo)
  const total = c.reduce((s, x) => s + x.peso, 0)
  if (total <= 0) return azar() < 0.5 ? a : b
  let r = azar() * total
  for (const x of c) {
    r -= x.peso
    if (r < 0) return x.def
  }
  return c[c.length - 1]!.def
}
