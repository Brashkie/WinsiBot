// La mazmorra del día (ver src/lib/dungeon.ts).
import { describe, expect, it } from 'vitest'
import {
  NIVELES, VIDA_MAX, generar, entrar, poderDe, cobrar, azarDe, diaDe,
} from '../src/lib/dungeon.ts'

describe('generar', () => {
  it('el mismo día da la misma mazmorra; otro día, otra', () => {
    expect(generar('2026-10-24')).toEqual(generar('2026-10-24'))
    expect(generar('2026-10-24')).not.toEqual(generar('2026-10-25'))
  })

  it('NIVELES niveles, 2 o 3 puertas, y el jefe solo al final', () => {
    for (let d = 1; d <= 28; d++) {
      const m = generar(`2026-02-${String(d).padStart(2, '0')}`)
      expect(m.niveles).toHaveLength(NIVELES)
      for (const [i, nivel] of m.niveles.entries()) {
        if (i === NIVELES - 1) {
          expect(nivel).toHaveLength(1)
          expect(nivel[0].tipo).toBe('jefe')
        } else {
          expect(nivel.length).toBeGreaterThanOrEqual(2)
          expect(nivel.length).toBeLessThanOrEqual(3)
          expect(nivel.every(s => s.tipo !== 'jefe' && s.pista)).toBe(true)
        }
      }
    }
  })

  it('las pistas no delatan: una misma pista sale de tipos distintos', () => {
    const tipos = {}
    for (let d = 0; d < 200; d++) {
      const m = generar(diaDe(Date.UTC(2026, 0, 1) + d * 86_400_000))
      for (const s of m.niveles.flat()) (tipos[s.pista] ??= new Set()).add(s.tipo)
    }
    const ambiguas = Object.values(tipos).filter(t => t.size > 1).length
    expect(ambiguas).toBeGreaterThanOrEqual(4)
  })
})

describe('entrar', () => {
  const medio = () => 0.5
  it('un monstruo cuesta menos vida a un grupo más fuerte', () => {
    const m = { tipo: 'monstruo', pista: '', nombre: 'Ogro', fuerza: 120 }
    const debil = entrar(m, 70, 100, medio)
    const fuerte = entrar(m, 400, 100, medio)
    expect(fuerte.vida).toBeGreaterThan(debil.vida)
    expect(debil.botin).toBe(120 * 20)
  })

  it('si el grupo cae, ese monstruo no da botín', () => {
    const r = entrar({ tipo: 'jefe', pista: '', nombre: 'X', fuerza: 300 }, 10, 5, medio)
    expect(r.vida).toBe(0)
    expect(r.botin).toBe(0)
  })

  it('la fuente no pasa del máximo', () => {
    expect(entrar({ tipo: 'fuente', pista: '', fuerza: 25 }, 0, 90, medio).vida).toBe(VIDA_MAX)
  })
})

describe('cobrar', () => {
  it('partes iguales con bono de grupo; terminar multiplica, caer rescata una parte', () => {
    expect(cobrar(1000, 1, 'retirada')).toBe(1000)
    expect(cobrar(1000, 4, 'retirada')).toBe(437)   // 1000 × 1,75 / 4
    expect(cobrar(1000, 4, 'terminada')).toBe(656)
    expect(cobrar(1000, 4, 'caida')).toBe(109)
    expect(cobrar(1000, 0, 'retirada')).toBe(0)
  })

  it('el bono deja de crecer en 8', () => {
    expect(cobrar(1000, 8, 'retirada')).toBe(cobrar(1000, 12, 'retirada') * 12 / 8 | 0)
  })
})

describe('equilibrio', () => {
  /** Baja siempre por una puerta al azar, sin retirarse nunca. */
  function bajar(poder, semilla) {
    const az = azarDe(semilla)
    const dia = diaDe(Date.UTC(2026, 0, 1) + (semilla % 365) * 86_400_000)
    const m = generar(dia)
    let vida = VIDA_MAX
    for (let n = 0; n < NIVELES; n++) {
      const nivel = m.niveles[n]
      const r = entrar(nivel[Math.floor(az() * nivel.length)], poder, vida, az)
      vida = r.vida
      if (vida <= 0) return n
    }
    return NIVELES
  }

  const tasa = (poder) => {
    let gana = 0
    for (let s = 1; s <= 2000; s++) if (bajar(poder, s) === NIVELES) gana++
    return gana / 2000
  }

  // Un jugador típico: nivel 10, compañero nivel 10, arma +0.
  const tipico = poderDe(10, 10, 1)

  it('solo, uno típico casi nunca tumba al jefe', () => {
    expect(tasa(tipico)).toBeLessThan(0.1)
  })

  it('cuatro típicos lo logran bastante seguido', () => {
    // Medido: ~48% bajando sin retirarse nunca.
    expect(tasa(tipico * 4)).toBeGreaterThan(0.35)
  })

  it('más poder, siempre más chances', () => {
    expect(tasa(tipico * 2)).toBeGreaterThan(tasa(tipico))
    expect(tasa(tipico * 6)).toBeGreaterThan(tasa(tipico * 3))
  })
})
