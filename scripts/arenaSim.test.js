// #simular (ver src/lib/arenaSim.ts): que use las reglas de la arena de
// verdad, que el caché de decisiones no cambie lo que decide la CPU, y que el
// intervalo sea honesto.
import { describe, expect, it } from 'vitest'
import { pelea, simular, wilson95, ESTILOS } from '../src/lib/arenaSim.ts'
import { mejorAccion, cacheDeDecisiones } from '../src/lib/arenaAI.ts'
import { CPU } from '../src/lib/pvp.ts'

// Un azar reproducible (xorshift), para que los tests no dependan de la suerte.
function semilla(s) {
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 1_000_000) / 1_000_000 }
}

describe('wilson95', () => {
  it('con 0% o 100% no dice ±0', () => {
    const [d, h] = wilson95(0, 20)
    expect(d).toBe(0)
    expect(h).toBeGreaterThan(0.1)
    expect(wilson95(20, 20)[0]).toBeLessThan(0.9)
  })
  it('con muchas peleas se cierra alrededor de la proporción', () => {
    const [d, h] = wilson95(450, 1000)
    expect(d).toBeLessThan(0.45)
    expect(h).toBeGreaterThan(0.45)
    expect(h - d).toBeLessThan(0.07)
  })
})

describe('el caché de decisiones', () => {
  it('decide lo mismo que la CPU sin caché', () => {
    const azar = semilla(7)
    const decidir = cacheDeDecisiones()
    for (let i = 0; i < 200; i++) {
      const s = {
        id: 'x', p1: 'p', p2: CPU, turn: CPU, round: 1, log: [], bet: 0, startTime: 0, lastAction: 0, cpu: 'normal',
        hp1: 1 + Math.floor(azar() * 100), hp2: 1 + Math.floor(azar() * 100),
        shield1: Math.floor(azar() * 17), shield2: Math.floor(azar() * 17),
        ultimateUsed1: azar() < 0.5, ultimateUsed2: azar() < 0.5,
      }
      // Dos veces: la segunda sale del caché.
      expect(decidir(s, 'normal')).toBe(mejorAccion(s, 'normal'))
      expect(decidir(s, 'normal')).toBe(mejorAccion(s, 'normal'))
    }
  })
})

describe('pelea', () => {
  it('cada estilo termina con un ganador en una cantidad de turnos razonable', () => {
    for (const e of ESTILOS) {
      const r = pelea('facil', e, semilla(3))
      expect(typeof r.gano).toBe('boolean')
      expect(r.turnos).toBeGreaterThan(0)
      expect(r.turnos).toBeLessThan(100)
    }
  })
})

describe('simular', () => {
  it('juega las peleas pedidas en todos los estilos, y el intervalo contiene la proporción', async () => {
    const r = await simular('facil', { peleas: 120, maxMs: 10_000, azar: semilla(11) })
    expect(r.map(x => x.estilo)).toEqual(ESTILOS)
    for (const x of r) {
      expect(x.peleas).toBe(120)
      expect(x.desde).toBeLessThanOrEqual(x.p)
      expect(x.hasta).toBeGreaterThanOrEqual(x.p)
    }
  })

  it('con poco tiempo corta, pero todos los estilos quedan con las mismas peleas', async () => {
    const r = await simular('normal', { peleas: 100_000, maxMs: 150 })
    const n = r.map(x => x.peleas)
    expect(Math.max(...n) - Math.min(...n)).toBeLessThanOrEqual(1)
    expect(Math.min(...n)).toBeGreaterThan(0)
  })
})
