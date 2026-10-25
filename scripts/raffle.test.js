// Los ganadores de un sorteo (ver src/lib/raffle.ts).
import { describe, expect, it } from 'vitest'
import { elegirGanadores, cuantosGanadores } from '../src/lib/raffle.ts'

describe('elegirGanadores', () => {
  it('distintos, del tamaño pedido, y nunca más que los anotados', () => {
    const g = elegirGanadores(['a', 'b', 'c', 'd'], 2)
    expect(g).toHaveLength(2)
    expect(new Set(g).size).toBe(2)
    expect(elegirGanadores(['a', 'b'], 5).sort()).toEqual(['a', 'b'])
    expect(elegirGanadores([], 3)).toEqual([])
  })

  it('no toca la lista original', () => {
    const l = ['a', 'b', 'c']
    elegirGanadores(l, 3)
    expect(l).toEqual(['a', 'b', 'c'])
  })

  it('parejo: cada uno gana más o menos las mismas veces', () => {
    const veces = { a: 0, b: 0, c: 0, d: 0, e: 0 }
    const N = 20_000
    for (let i = 0; i < N; i++) veces[elegirGanadores(Object.keys(veces), 1)[0]]++
    for (const v of Object.values(veces)) expect(Math.abs(v / N - 0.2)).toBeLessThan(0.02)
  })
})

describe('cuantosGanadores', () => {
  it('lee x3 o 3x y lo saca del premio', () => {
    expect(cuantosGanadores('Nitro x3')).toEqual({ cuantos: 3, premio: 'Nitro' })
    expect(cuantosGanadores('2x Netflix un mes')).toEqual({ cuantos: 2, premio: 'Netflix un mes' })
    expect(cuantosGanadores('Una pizza')).toEqual({ cuantos: 1, premio: 'Una pizza' })
  })

  it('no confunde números del premio y tiene tope', () => {
    expect(cuantosGanadores('500 diamantes').cuantos).toBe(1)
    expect(cuantosGanadores('algo x99').cuantos).toBe(10)
  })
})
