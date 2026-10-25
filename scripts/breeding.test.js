// La cría de dragones (ver src/lib/breeding.ts).
import { describe, expect, it } from 'vitest'
import { candidatos, elegirCria } from '../src/lib/breeding.ts'

const d = (id, rarity, ...elements) => ({ id, name: `D${id}`, rarity, elements })
const A = d(1, 'Legendary', 'Flame', 'Dark', 'Time', 'Dream')
const B = d(2, 'Legendary', 'Ice', 'Sea', 'Wind', 'Terra')
const CAT = [
  A, B,
  d(3, 'Legendary', 'Flame', 'Ice', 'Metal', 'Pure'),   // 1 de cada uno
  d(4, 'Legendary', 'Flame', 'Dark', 'Ice', 'Sea'),     // 2 de cada uno
  d(5, 'Legendary', 'Metal', 'Pure', 'Light', 'Soul'),  // de ninguno
  d(6, 'Legendary', 'Flame', 'Dark', 'Time', 'Light'),  // solo de A
  d(7, 'Heroic',    'Flame', 'Dark', 'Ice', 'Sea'),     // como 4, pero rara
]

describe('candidatos', () => {
  it('solo los que comparten con los DOS padres', () => {
    const ids = candidatos(A, B, CAT).map(x => x.def.id).sort()
    expect(ids).toEqual([3, 4, 7])
  })

  it('más afinidad pesa más, y la rareza escasa pesa menos', () => {
    const p = Object.fromEntries(candidatos(A, B, CAT).map(x => [x.def.id, x.peso]))
    expect(p[4]).toBeGreaterThan(p[3])
    expect(p[7]).toBeLessThan(p[4])
  })
})

describe('elegirCria', () => {
  it('a veces sale la especie de un padre', () => {
    const seq = [0.1, 0.2]   // < 0.3: padre; < 0.5: A
    let i = 0
    expect(elegirCria(A, B, CAT, () => seq[i++]).id).toBe(1)
  })

  it('si no, un candidato, nunca uno sin afinidad', () => {
    const vistos = new Set()
    for (let k = 0; k < 2000; k++) vistos.add(elegirCria(A, B, CAT).id)
    expect(vistos.has(5)).toBe(false)
    expect(vistos.has(6)).toBe(false)
    expect(vistos.has(4)).toBe(true)
  })

  it('sin candidatos, un padre', () => {
    const solo = [A, B]
    const r = elegirCria(A, B, solo, () => 0.9)
    expect([1, 2]).toContain(r.id)
  })
})
