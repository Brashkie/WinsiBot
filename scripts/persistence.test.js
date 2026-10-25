// MapConTocados: el Map de usuarios que anota qué se pidió desde el último
// guardado, para no serializar a todos cada 30 s (ver events/index.ts).
import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'fs'
import { createHash } from 'crypto'
import { MapConTocados } from '../src/lib/touchedMap.ts'

describe('MapConTocados', () => {
  it('la primera vez devuelve todo, después solo lo que se pidió', () => {
    const m = new MapConTocados()
    m.set('a', { n: 1 })
    m.set('b', { n: 2 })
    m.set('c', { n: 3 })
    expect(m.tomarTocadas().map(([k]) => k).sort()).toEqual(['a', 'b', 'c'])
    expect(m.tomarTocadas()).toEqual([])

    m.get('b').n = 20 // la forma en que el bot modifica usuarios
    expect(m.tomarTocadas()).toEqual([['b', { n: 20 }]])
  })

  it('pedir una clave que no existe no marca nada', () => {
    const m = new MapConTocados()
    m.tomarTocadas()
    m.get('nadie')
    expect(m.tomarTocadas()).toEqual([])
  })

  it('recorrer el mapa marca todo, porque cualquiera pudo modificarse', () => {
    const m = new MapConTocados([['a', { n: 1 }], ['b', { n: 2 }]])
    m.tomarTocadas()
    for (const [, v] of m) v.n++ // un ranking que, por error, modificara
    expect(m.tomarTocadas().length).toBe(2)
    ;[...m.entries()]
    expect(m.tomarTocadas().length).toBe(2)
    m.forEach(() => {})
    expect(m.tomarTocadas().length).toBe(2)
    ;[...m.values()]
    expect(m.tomarTocadas().length).toBe(2)
  })

  it('tomarTocadas no se marca a sí misma, y size/has/keys no marcan', () => {
    const m = new MapConTocados([['a', { n: 1 }]])
    m.tomarTocadas()
    m.has('a')
    void m.size
    ;[...m.keys()]
    expect(m.tomarTocadas()).toEqual([])
  })

  it('con los usuarios reales, guardar tras pocos cambios cuesta casi nada', () => {
    if (!existsSync('data/users.json')) return
    const m = new MapConTocados(Object.entries(JSON.parse(readFileSync('data/users.json', 'utf8'))))
    const ciclo = () => {
      const c0 = process.cpuUsage()
      for (const [, d] of m.tomarTocadas()) createHash('sha1').update(JSON.stringify(d)).digest('hex')
      const c = process.cpuUsage(c0)
      return (c.user + c.system) / 1000
    }
    const todos = ciclo() // el primero, completo
    const claves = [...m.keys()].slice(0, 10)
    for (const k of claves) m.get(k)
    const pocos = ciclo()
    console.log(`    ${m.size} usuarios: primer guardado ${todos.toFixed(1)} ms, con 10 tocados ${pocos.toFixed(2)} ms`)
    expect(pocos).toBeLessThan(todos)
  })
})
