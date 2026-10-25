// La CPU de la arena (ver src/lib/arenaAI.ts).
import { describe, expect, it } from 'vitest'
import { Arena, CPU } from '../src/lib/pvp.ts'
import { elegirAccion, evaluar } from '../src/lib/arenaAI.ts'

const nunca = () => 0.99   // sin errores a propósito

function pelea(over = {}) {
  return {
    id: 't', p1: 'yo@s', p2: CPU, hp1: 100, hp2: 100, shield1: 0, shield2: 0,
    turn: CPU, round: 1, log: [], bet: 0, startTime: 0, lastAction: 0,
    ultimateUsed1: false, ultimateUsed2: false, cpu: 'dificil', ...over,
  }
}

const ACC = ['atacar', 'poderoso', 'defender', 'curar', 'ultimate']

/** Una pelea entera: la CPU contra alguien que elige al azar. Gana la CPU → true. */
function partida(nivel) {
  const s = pelea({ turn: 'yo@s', cpu: nivel })
  for (let i = 0; i < 200; i++) {
    const actor = s.turn
    let a
    if (actor === CPU) a = elegirAccion(s, nivel)
    else {
      const ops = s.ultimateUsed1 ? ACC.slice(0, 4) : ACC
      a = ops[Math.floor(Math.random() * ops.length)]
    }
    const r = Arena.processAction(s, actor, a)
    if (r.over) return r.winner === CPU
  }
  return s.hp2 > s.hp1
}

describe('elegirAccion', () => {
  it('remata con lo seguro, no con lo que puede fallar', () => {
    // 5 de vida: atacar (8–18) mata siempre; poderoso falla 3 de 10.
    expect(elegirAccion(pelea({ hp1: 5 }), 'dificil', nunca)).not.toBe('poderoso')
  })

  it('no usa el ultimate dos veces', () => {
    for (let i = 0; i < 20; i++) {
      expect(elegirAccion(pelea({ ultimateUsed2: true, hp1: 40 }), 'dificil', nunca)).not.toBe('ultimate')
    }
  })

  it('con poca vida y el rival lejos de morir, no se queda atacando', () => {
    // El rival ya gastó su ultimate: curarse o defenderse sí salva la pelea.
    // (Con el ultimate del rival disponible, 12 de vida está perdido haga lo
    // que haga, y todas las jugadas valen lo mismo.)
    const a = elegirAccion(pelea({ hp2: 12, hp1: 90, ultimateUsed1: true }), 'dificil', nunca)
    expect(['curar', 'defender', 'ultimate']).toContain(a)
  })

  it('no modifica la pelea real al pensar', () => {
    const s = pelea({ hp1: 50, hp2: 60, shield1: 4 })
    const antes = JSON.stringify(s)
    elegirAccion(s, 'dificil', nunca)
    expect(JSON.stringify(s)).toBe(antes)
  })

  it('en fácil a veces se equivoca a propósito', () => {
    const vistos = new Set()
    for (let i = 0; i < 300; i++) vistos.add(elegirAccion(pelea(), 'facil'))
    expect(vistos.size).toBeGreaterThan(2)
  })

  it('una jugada en difícil tarda poco', () => {
    const t = performance.now()
    elegirAccion(pelea({ hp1: 70, hp2: 65 }), 'dificil', nunca)
    expect(performance.now() - t).toBeLessThan(1000)
  })
})

describe('contra alguien que juega al azar', () => {
  it('normal gana la gran mayoría', () => {
    let g = 0
    for (let i = 0; i < 200; i++) if (partida('normal')) g++
    expect(g / 200).toBeGreaterThan(0.75)
  })

  it('difícil gana la gran mayoría', () => {
    let g = 0
    for (let i = 0; i < 30; i++) if (partida('dificil')) g++
    expect(g / 30).toBeGreaterThan(0.75)
  }, 60_000)
})

describe('evaluar', () => {
  it('terminal y ventaja', () => {
    expect(evaluar(pelea({ hp1: 0 }))).toBeGreaterThan(500)
    expect(evaluar(pelea({ hp2: 0 }))).toBeLessThan(-500)
    expect(evaluar(pelea({ hp2: 80, hp1: 50 }))).toBeGreaterThan(evaluar(pelea({ hp2: 50, hp1: 80 })))
  })
})
