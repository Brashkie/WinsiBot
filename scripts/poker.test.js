// El evaluador de póker y Casino Hold'em (ver src/lib/poker.ts).
import { describe, expect, it } from 'vitest'
import {
  evaluar5, mejorMano, comparar, nombreMano, pagoAnte, califica, resolver, mazo,
} from '../src/lib/poker.ts'

// "As♠ Kh 10d": rango (A,2..10,J,Q,K) + palo (s h d c)
const P = { s: '♠', h: '♥', d: '♦', c: '♣' }
const R = { A: 1, J: 11, Q: 12, K: 13 }
const c = (...xs) => xs.map(x => ({ r: R[x.slice(0, -1)] ?? Number(x.slice(0, -1)), p: P[x.slice(-1)] }))
const nom = (...xs) => nombreMano(evaluar5(c(...xs)))

describe('evaluar5', () => {
  it('reconoce cada categoría', () => {
    expect(nom('As', 'Ks', 'Qs', 'Js', '10s')).toBe('Escalera real')
    expect(nom('9h', '8h', '7h', '6h', '5h')).toBe('Escalera de color')
    expect(nom('7c', '7d', '7h', '7s', '2c')).toBe('Póker')
    expect(nom('3c', '3d', '3h', '9s', '9c')).toBe('Full')
    expect(nom('2d', '9d', 'Jd', '4d', 'Kd')).toBe('Color')
    expect(nom('5c', '6d', '7h', '8s', '9c')).toBe('Escalera')
    expect(nom('Ac', '2d', '3h', '4s', '5c')).toBe('Escalera')
    expect(nom('Qc', 'Qd', 'Qh', '4s', '9c')).toBe('Trío')
    expect(nom('Jc', 'Jd', '4h', '4s', '9c')).toBe('Doble par')
    expect(nom('10c', '10d', '4h', '3s', '9c')).toBe('Par')
    expect(nom('Ac', 'Jd', '4h', '3s', '9c')).toBe('Carta alta')
  })

  it('A-2-3-4-5 es la escalera más baja', () => {
    expect(comparar(evaluar5(c('Ac', '2d', '3h', '4s', '5c')), evaluar5(c('2c', '3d', '4h', '5s', '6c')))).toBeLessThan(0)
  })

  it('desempata por kicker', () => {
    const a = evaluar5(c('Kc', 'Kd', 'Ah', '7s', '2c'))
    const b = evaluar5(c('Kh', 'Ks', 'Qh', '7c', '2d'))
    expect(comparar(a, b)).toBeGreaterThan(0)
  })

  it('full: manda el trío', () => {
    expect(comparar(evaluar5(c('3c', '3d', '3h', 'As', 'Ac')), evaluar5(c('2c', '2d', '2h', 'Ks', 'Kc')))).toBeGreaterThan(0)
  })

  it('el palo no desempata', () => {
    expect(comparar(evaluar5(c('Ac', 'Kd', '9h', '7s', '2c')), evaluar5(c('Ad', 'Kh', '9s', '7c', '2d')))).toBe(0)
  })
})

describe('mejorMano', () => {
  it('elige las mejores 5 de 7', () => {
    const m = mejorMano(c('Ah', 'Kh', '2c', 'Qh', 'Jh', '10h', '3d'))
    expect(nombreMano(m.valor)).toBe('Escalera real')
    expect(m.cartas).toHaveLength(5)
  })

  it('con la mesa jugando sola', () => {
    expect(nombreMano(mejorMano(c('2c', '3d', '9s', '9c', '9h', 'Kd', 'Ks')).valor)).toBe('Full')
  })

  it('la frecuencia de categorías con 7 cartas es la conocida', () => {
    // Con 7 cartas: color ~3,0%, full ~2,6%, par ~43,8%. 20.000 manos al azar.
    const n = 20_000
    const cuenta = {}
    for (let i = 0; i < n; i++) {
      const m = mazo()
      const nm = nombreMano(mejorMano(m.slice(0, 7)).valor)
      cuenta[nm] = (cuenta[nm] ?? 0) + 1
    }
    expect(cuenta['Par'] / n).toBeGreaterThan(0.41)
    expect(cuenta['Par'] / n).toBeLessThan(0.47)
    expect(cuenta['Color'] / n).toBeGreaterThan(0.024)
    expect(cuenta['Color'] / n).toBeLessThan(0.036)
  })
})

describe('Casino Hold\'em', () => {
  it('el crupier califica con par de 4 o más', () => {
    expect(califica(evaluar5(c('4c', '4d', '9h', 'Js', 'Kc')))).toBe(true)
    expect(califica(evaluar5(c('3c', '3d', '9h', 'Js', 'Kc')))).toBe(false)
    expect(califica(evaluar5(c('Ac', 'Kd', '9h', 'Js', '2c')))).toBe(false)
  })

  it('tabla del ante', () => {
    expect(pagoAnte(evaluar5(c('As', 'Ks', 'Qs', 'Js', '10s')))).toBe(100)
    expect(pagoAnte(evaluar5(c('3c', '3d', '3h', '9s', '9c')))).toBe(3)
    expect(pagoAnte(evaluar5(c('10c', '10d', '4h', '3s', '9c')))).toBe(1)
  })

  const mesa = c('2c', '7d', '9h', 'Js', 'Kc')

  it('crupier no califica: el ante paga y la ida se devuelve', () => {
    const r = resolver(c('Ac', 'Ad'), c('3d', '5s'), mesa, 100)
    expect(r.resultado).toBe('no-califica')
    expect(r.pago).toBe(100 + 100 + 200)
  })

  it('gana el jugador: ante por tabla, ida 1:1', () => {
    const r = resolver(c('Ac', 'Ad'), c('Jd', '4s'), mesa, 100)
    expect(r.resultado).toBe('gana')
    expect(r.pago).toBe(200 + 400)
  })

  it('pierde: nada; empate: devuelve todo', () => {
    expect(resolver(c('3c', '4d'), c('Kd', '5s'), mesa, 100)).toMatchObject({ resultado: 'pierde', pago: 0 })
    expect(resolver(c('Kh', '3d'), c('Kd', '3s'), mesa, 100)).toMatchObject({ resultado: 'empate', pago: 300 })
  })

  it('yendo siempre, la casa gana poco', () => {
    // Medido con 300.000 manos: ir siempre pierde ~7,7% del ante por mano
    // (~2,6% de lo apostado). La ventaja publicada del juego es 2,16% del
    // ante con la estrategia óptima; ir siempre es peor que esa. Acá solo se
    // comprueba que la casa no gane una barbaridad.
    let neto = 0, puesto = 0
    for (let i = 0; i < 20_000; i++) {
      const m = mazo()
      const r = resolver(m.slice(0, 2), m.slice(2, 4), m.slice(4, 9), 1)
      neto += r.pago - 3
      puesto += 3
    }
    expect(neto / puesto).toBeGreaterThan(-0.1)
    expect(neto / puesto).toBeLessThan(0.02)
  })
})
