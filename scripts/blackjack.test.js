// Las reglas de #bj (ver src/lib/blackjack.ts).
import { describe, expect, it } from 'vitest'
import { mazo, valor, esBlackjack, juegaCrupier, resolver, mostrar } from '../src/lib/blackjack.ts'

const c = (...rs) => rs.map(r => ({ r, p: '♠' }))

describe('valor', () => {
  it('figuras valen 10', () => {
    expect(valor(c(13, 12)).total).toBe(20)
    expect(valor(c(11, 10, 1)).total).toBe(21)
  })

  it('el As vale 11 mientras no se pase, y la mano es blanda', () => {
    expect(valor(c(1, 6))).toEqual({ total: 17, blanda: true })
    expect(valor(c(1, 6, 10))).toEqual({ total: 17, blanda: false })
    expect(valor(c(1, 1))).toEqual({ total: 12, blanda: true })
    expect(valor(c(1, 1, 1, 1, 10, 10))).toEqual({ total: 24, blanda: false })
  })

  it('blackjack es 21 con DOS cartas', () => {
    expect(esBlackjack(c(1, 13))).toBe(true)
    expect(esBlackjack(c(7, 7, 7))).toBe(false)
  })
})

describe('mazo', () => {
  it('52 cartas distintas', () => {
    const m = mazo()
    expect(m).toHaveLength(52)
    expect(new Set(m.map(x => x.r + x.p)).size).toBe(52)
  })

  it('baraja con el azar que se le da', () => {
    const a = mazo(() => 0).map(x => x.r + x.p)
    const b = mazo(() => 0).map(x => x.r + x.p)
    expect(a).toEqual(b)
    expect(mazo().map(x => x.r + x.p)).not.toEqual(a) // casi seguro
  })
})

describe('juegaCrupier', () => {
  it('pide hasta 17 y se planta en 17 blando', () => {
    const m = c(5, 10)     // pop() saca del final: primero 10
    const mano = c(4, 2)   // 6 → +10 = 16 → +5 = 21
    juegaCrupier(mano, m)
    expect(valor(mano).total).toBe(21)

    const blando = c(1, 6)
    juegaCrupier(blando, c(10))
    expect(blando).toHaveLength(2)
  })
})

describe('resolver', () => {
  it('pagos: devuelve apuesta incluida', () => {
    expect(resolver(c(10, 9), c(10, 8), 100)).toEqual({ resultado: 'gana', pago: 200 })
    expect(resolver(c(10, 8), c(10, 8), 100)).toEqual({ resultado: 'empate', pago: 100 })
    expect(resolver(c(10, 7), c(10, 8), 100)).toEqual({ resultado: 'pierde', pago: 0 })
    expect(resolver(c(10, 5, 9), c(10, 8), 100)).toEqual({ resultado: 'pasa', pago: 0 })
  })

  it('blackjack paga 3:2, y contra blackjack del crupier es empate', () => {
    expect(resolver(c(1, 13), c(10, 9), 100)).toEqual({ resultado: 'blackjack', pago: 250 })
    expect(resolver(c(1, 13), c(1, 12), 100)).toEqual({ resultado: 'empate', pago: 100 })
    expect(resolver(c(10, 5, 6), c(1, 12), 100)).toEqual({ resultado: 'pierde', pago: 0 })
  })

  it('si el crupier se pasa, gana el que no se pasó', () => {
    expect(resolver(c(10, 2), c(10, 6, 9), 100)).toEqual({ resultado: 'gana', pago: 200 })
  })

  it('pasarse pierde aunque el crupier también se pase', () => {
    expect(resolver(c(10, 6, 9), c(10, 6, 8), 100).resultado).toBe('pasa')
  })
})

describe('mostrar', () => {
  it('oculta la segunda del crupier', () => {
    expect(mostrar([{ r: 1, p: '♥' }, { r: 12, p: '♣' }], true)).toBe('A♥ 🂠')
    expect(mostrar([{ r: 10, p: '♦' }])).toBe('10♦')
  })
})
