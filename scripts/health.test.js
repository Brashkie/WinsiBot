// La salud, los cuidados del compañero y el contraataque del jefe
// (ver src/lib/health.ts, companion.ts y raid.ts).
import { describe, expect, it } from 'vitest'
import { saludDe, herir, curar, esperaHasta, costoHospital, MAX, REGEN_MS } from '../src/lib/health.ts'
import { cuidar, restante, atendidos, bonoCuidado, CUIDADOS, EXP_PASEO } from '../src/lib/companion.ts'
import { contraataque, PROB_CONTRA } from '../src/lib/raid.ts'

const T0 = Date.UTC(2026, 9, 24, 12, 0, 0)
const MIN = 60_000

describe('salud', () => {
  it('se regenera sola, un punto cada REGEN_MS, hasta el máximo', () => {
    const u = { health: 50, saludAt: T0 }
    expect(saludDe(u, T0)).toBe(50)
    expect(saludDe(u, T0 + REGEN_MS * 10 + 1)).toBe(60)
    expect(saludDe(u, T0 + REGEN_MS * 1000)).toBe(MAX)
  })

  it('un usuario de antes, sin saludAt, tiene la que tenía; llena no regenera', () => {
    expect(saludDe({ health: 70 })).toBe(70)
    expect(saludDe({ health: 100, saludAt: T0 }, T0 + 10 * REGEN_MS)).toBe(100)
  })

  it('herir no baja de 0 y empieza a regenerar desde ahí', () => {
    const u = { health: 100 }
    expect(herir(u, 30, T0)).toBe(70)
    expect(herir(u, 500, T0)).toBe(0)
    expect(saludDe(u, T0 + REGEN_MS * 5)).toBe(5)
  })

  it('pegar o curar no tira lo que ya se regeneró de un punto', () => {
    const u = { health: 50, saludAt: T0 }
    // 2,5 puntos regenerados: 52 y medio punto en curso.
    herir(u, 10, T0 + REGEN_MS * 2.5)
    expect(u.health).toBe(42)
    expect(saludDe(u, T0 + REGEN_MS * 3)).toBe(43)
  })

  it('curar llena hasta el máximo y deja de contar', () => {
    const u = { health: 90, saludAt: T0 }
    expect(curar(u, 40, T0)).toBe(MAX)
    expect(u.saludAt).toBeUndefined()
  })

  it('esperaHasta y el hospital', () => {
    const u = { health: 0, saludAt: T0, level: 10 }
    expect(esperaHasta(u, 20, T0)).toBe(20 * REGEN_MS)
    expect(esperaHasta(u, 20, T0 + REGEN_MS / 2)).toBe(20 * REGEN_MS - REGEN_MS / 2)
    expect(costoHospital(u, T0)).toBe(3000)
    expect(costoHospital({ health: 100, level: 50 }, T0)).toBe(0)
  })
})

const dragon = (extra = {}) => ({ id: 1, slug: 'x', name: 'Drako', level: 5, exp: 0, stage: 1, hatchedAt: 1, lastCollect: 0, ...extra })

describe('cuidados del compañero', () => {
  it('sin dragón, nada', () => {
    expect(cuidar({ dragons: [] }, 'comida', T0)).toEqual({ ok: false, motivo: 'sin-companero' })
    expect(bonoCuidado({ dragons: [], cuidado: { comida: T0 } }, T0).atendidos).toBe(0)
  })

  it('cada cuidado dura lo suyo y se repite recién a la mitad', () => {
    const u = { dragons: [dragon()] }
    expect(cuidar(u, 'agua', T0).ok).toBe(true)
    expect(restante(u, 'agua', T0 + 60 * MIN)).toBe(CUIDADOS.agua.dura - 60 * MIN)
    const r = cuidar(u, 'agua', T0 + 60 * MIN)
    expect(r.ok).toBe(false)
    expect(r.falta).toBe(CUIDADOS.agua.dura / 2 - 60 * MIN)
    expect(cuidar(u, 'agua', T0 + CUIDADOS.agua.dura / 2).ok).toBe(true)
  })

  it('el paseo da exp al compañero', () => {
    const d = dragon()
    const u = { dragons: [d] }
    expect(cuidar(u, 'paseo', T0)).toMatchObject({ ok: true, exp: EXP_PASEO })
    expect(d.exp + d.level).toBeGreaterThan(5)
  })

  it('el bono sube con los cuidados al día y se va cuando se vencen', () => {
    const u = { dragons: [dragon()] }
    for (const c of ['comida', 'agua', 'paseo']) cuidar(u, c, T0)
    expect(atendidos(u, T0)).toBe(3)
    expect(bonoCuidado(u, T0)).toMatchObject({ danio: 1.15, atendidos: 3 })
    expect(bonoCuidado(u, T0).defensa).toBeCloseTo(0.55)
    // A las 7 h se venció el agua (6 h); comida (8 h) y paseo (12 h) siguen.
    expect(atendidos(u, T0 + 7 * 60 * MIN)).toBe(2)
    expect(atendidos(u, T0 + 13 * 60 * MIN)).toBe(0)
  })
})

describe('contraataque', () => {
  it('a veces no contraataca', () => {
    expect(contraataque(() => PROB_CONTRA, 1)).toBe(0)
  })

  it('pega de 8 a 20, menos con defensa', () => {
    const azar = v => { let i = 0; return () => (i++ === 0 ? 0 : v) }
    expect(contraataque(azar(0), 1)).toBe(8)
    expect(contraataque(azar(0.999), 1)).toBe(20)
    expect(contraataque(azar(0.999), 0.55)).toBe(11)
  })
})
