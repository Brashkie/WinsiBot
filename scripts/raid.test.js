// Las cuentas del jefe de mundo (ver src/lib/raid.ts).
import { describe, expect, it } from 'vitest'
import { JEFES, vidaJefe, danio, repartir, barra, reaccion, ELEMENTO } from '../src/lib/raid.ts'

describe('reaccion', () => {
  it('combina en cualquier orden', () => {
    expect(reaccion(['Flame'], ['Wind'])).toMatchObject({ nombre: 'Tormenta de fuego', elementos: ['Flame', 'Wind'] })
    expect(reaccion(['Wind'], ['Flame'])).toMatchObject({ nombre: 'Tormenta de fuego', elementos: ['Wind', 'Flame'] })
  })

  it('con cuatro elementos cada uno, la mejor combinación', () => {
    const r = reaccion(['Flame', 'Light', 'Sea', 'Happy'], ['Ice', 'Dark', 'Terra', 'Beauty'])
    expect(r.nombre).toBe('Eclipse')
    expect(r.mult).toBe(1.8)
  })

  it('sin combinación, nada; un elemento consigo mismo tampoco', () => {
    expect(reaccion(['Flame'], ['Flame'])).toBeNull()
    expect(reaccion(['Happy'], ['War'])).toBeNull()
    expect(reaccion([], ['Wind'])).toBeNull()
  })

  it('solo usa elementos que existen en el catálogo', () => {
    // Cualquier par que forme reacción tiene nombre en español para mostrar.
    const todos = Object.keys(ELEMENTO)
    expect(todos).toHaveLength(21)
    for (const a of todos) for (const b of todos) {
      const r = reaccion([a], [b])
      if (r) expect(ELEMENTO[r.elementos[0]] && ELEMENTO[r.elementos[1]]).toBeTruthy()
    }
  })
})

const def = JEFES[0]

describe('vidaJefe', () => {
  it('crece con los participantes del raid anterior, con tope', () => {
    expect(vidaJefe(def, 0)).toBe(def.hpBase)
    expect(vidaJefe(def, 2)).toBe(def.hpBase * 2)
    expect(vidaJefe(def, 40)).toBe(vidaJefe(def, 500))
  })
})

describe('danio', () => {
  it('sube con nivel y dragón, dentro de ±25%', () => {
    const medio = () => 0.5   // variación 1.0, sin crítico
    expect(danio(0, 0, medio)).toEqual({ danio: 40, critico: false })
    expect(danio(10, 5, medio).danio).toBe(40 + 60 + 20)
    const min = danio(10, 0, () => 0.99).danio
    expect(min).toBeLessThanOrEqual(Math.round(100 * 1.25))
  })

  it('crítico duplica', () => {
    const seq = [0.5, 0.05]   // variación 1.0, y crítico
    let i = 0
    expect(danio(0, 0, () => seq[i++])).toEqual({ danio: 80, critico: true })
  })

  it('el arma multiplica', () => {
    const medio = () => 0.5
    expect(danio(0, 0, medio, 1.4).danio).toBe(56)
  })

  it('nunca menos de 1', () => {
    expect(danio(-5, -5, () => 0).danio).toBeGreaterThanOrEqual(1)
  })
})

describe('repartir', () => {
  it('por daño, con extra para MVP y remate', () => {
    const p = repartir({ a: 300, b: 100 }, 1000, 'b')
    const a = p.find(x => x.jid === 'a')
    const b = p.find(x => x.jid === 'b')
    // Bolsa: ¥1500 y 150 exp. a: 75% ×1.2; b: 25% ×1.1.
    expect(a).toEqual({ jid: 'a', dinero: 1350, exp: 135, mvp: true, remate: false })
    expect(b).toEqual({ jid: 'b', dinero: 413, exp: 41, mvp: false, remate: true })
    expect(p[0].jid).toBe('a')
  })

  it('la consolación es una fracción', () => {
    const lleno = repartir({ a: 10 }, 1000, null)[0]
    const cuarto = repartir({ a: 10 }, 1000, null, 0.25)[0]
    expect(cuarto.dinero).toBe(Math.round(lleno.dinero / 4))
  })

  it('sin daño no hay premios', () => {
    expect(repartir({}, 1000, null)).toEqual([])
  })

  it('el MVP con empate es estable', () => {
    const x = repartir({ z: 50, a: 50 }, 1000, null)
    expect(x.find(p => p.mvp)?.jid).toBe('a')
  })
})

describe('barra', () => {
  it('proporcional', () => {
    expect(barra(50, 100)).toBe('▰▰▰▰▰▱▱▱▱▱')
    expect(barra(0, 100)).toBe('▱▱▱▱▱▱▱▱▱▱')
    expect(barra(-3, 100)).toBe('▱▱▱▱▱▱▱▱▱▱')
  })
})
