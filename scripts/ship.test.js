// #ship y #lista (ver src/lib/ship.ts y src/lib/lineup.ts).
import { describe, expect, it } from 'vitest'
import { compatibilidad, nombreDePareja, barra, veredicto } from '../src/lib/ship.ts'
import { formatoDe, nueva, unir, salir, maxSuplentes } from '../src/lib/lineup.ts'

describe('compatibilidad', () => {
  it('la misma pareja da siempre lo mismo, en cualquier orden', () => {
    const p = compatibilidad('51911@s.whatsapp.net', '51922@s.whatsapp.net')
    expect(compatibilidad('51922@s.whatsapp.net', '51911@s.whatsapp.net')).toBe(p)
    expect(compatibilidad('51911:3@s.whatsapp.net', '51922@s.whatsapp.net')).toBe(p)
    expect(p).toBeGreaterThanOrEqual(0)
    expect(p).toBeLessThanOrEqual(100)
  })

  it('reparte de 0 a 100, no se amontona', () => {
    const vistos = new Set()
    for (let i = 0; i < 2000; i++) vistos.add(compatibilidad(`5191${i}@s`, `5192${i * 7}@s`))
    expect(vistos.size).toBeGreaterThan(90)
  })

  it('consigo mismo, 100', () => {
    expect(compatibilidad('51911@s.whatsapp.net', '51911@lid')).toBe(100)
  })

  it('nombre, barra y veredicto', () => {
    expect(nombreDePareja('Ana', 'Beto')).toBe('Anto')
    expect(nombreDePareja('Mariana', 'José')).toBe('Marisé')   // conserva la tilde
    expect(barra(50)).toBe('❤️'.repeat(5) + '🤍'.repeat(5))
    expect(veredicto(100)).toMatch(/gemelas/)
    expect(veredicto(0)).toMatch(/destino/)
  })
})

describe('lineup', () => {
  it('formatos', () => {
    expect(formatoDe('4vs4')).toBe(4)
    expect(formatoDe('12v12')).toBe(12)
    expect(formatoDe('6')).toBe(6)
    expect(formatoDe('4vs6')).toBeNull()
    expect(formatoDe('5vs5')).toBeNull()
  })

  it('reparte parejo, después suplentes, después llena', () => {
    const l = nueva('Clan', 4, 'c')
    const lugares = Array.from({ length: 10 }, (_, i) => unir(l, `j${i}`))
    expect(l.A).toHaveLength(4)
    expect(l.B).toHaveLength(4)
    expect(l.S).toHaveLength(maxSuplentes(4))
    expect(lugares.slice(0, 2).map(r => r.equipo)).toEqual(['A', 'B'])
    expect(unir(l, 'otro')).toEqual({ ok: false, motivo: 'llena' })
  })

  it('pedir un equipo lleno avisa, no manda a otro', () => {
    const l = nueva('x', 4, 'c')
    for (let i = 0; i < 4; i++) unir(l, `a${i}`, 'A')
    expect(unir(l, 'nuevo', 'A')).toEqual({ ok: false, motivo: 'equipo-lleno' })
    expect(unir(l, 'nuevo', 'B')).toEqual({ ok: true, equipo: 'B' })
  })

  it('cambiar de equipo no duplica', () => {
    const l = nueva('x', 4, 'c')
    unir(l, 'yo', 'A')
    unir(l, 'yo', 'B')
    expect(l.A).toEqual([])
    expect(l.B).toEqual(['yo'])
  })

  it('al salir alguien de un equipo, sube el primer suplente', () => {
    const l = nueva('x', 4, 'c')
    for (let i = 0; i < 10; i++) unir(l, `j${i}`)
    const primerSuplente = l.S[0]
    const r = salir(l, l.A[0])
    expect(r).toEqual({ salio: true, subio: primerSuplente })
    expect(l.A).toContain(primerSuplente)
    expect(l.A).toHaveLength(4)
  })
})
