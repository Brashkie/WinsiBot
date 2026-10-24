// El teléfono descompuesto (ver src/lib/historia.ts).
import { describe, expect, it } from 'vitest'
import { turnosTotales, turnoDe, loQueVe, limpiar, relato, textoPlano, MAX_CARACTERES } from '../src/lib/historia.ts'

describe('turnos', () => {
  it('dos vueltas con pocos jugadores, una con muchos', () => {
    expect(turnosTotales(3)).toBe(6)
    expect(turnosTotales(4)).toBe(8)
    expect(turnosTotales(5)).toBe(5)
    expect(turnosTotales(10)).toBe(10)
  })

  it('en orden de llegada, en vueltas; nadie juega dos veces seguidas', () => {
    const orden = ['a', 'b', 'c']
    const turnos = Array.from({ length: turnosTotales(3) }, (_, t) => turnoDe(orden, t))
    expect(turnos).toEqual(['a', 'b', 'c', 'a', 'b', 'c'])
    for (let i = 1; i < turnos.length; i++) expect(turnos[i]).not.toBe(turnos[i - 1])
  })
})

describe('loQueVe', () => {
  it('solo el último fragmento: eso es lo que descompone el teléfono', () => {
    const f = [
      { autor: 'a', texto: 'Un gato abrió una tienda.' },
      { autor: null, texto: 'Pero solo vendía nubes.' },
    ]
    expect(loQueVe(f)).toBe('Pero solo vendía nubes.')
    expect(loQueVe(f)).not.toContain('gato')
  })

  it('sin fragmentos, nada', () => {
    expect(loQueVe([])).toBe('')
  })
})

describe('limpiar', () => {
  it('junta espacios y corta en el tope', () => {
    expect(limpiar('  hola   que\n tal ')).toBe('hola que tal')
    expect(limpiar('x'.repeat(500))).toHaveLength(MAX_CARACTERES)
  })
})

describe('relato', () => {
  it('marca lo de la IA y nombra a cada autor', () => {
    const r = relato([
      { autor: 'a@s', texto: 'Un gato abrió una tienda.' },
      { autor: null, texto: 'Pero solo vendía nubes.' },
    ], j => (j === 'a@s' ? 'Ana' : j))
    expect(r).toBe('✍️ *Ana:* Un gato abrió una tienda.\n🤖 _Pero solo vendía nubes._')
    expect(textoPlano([{ autor: 'a', texto: 'Uno.' }, { autor: null, texto: 'Dos.' }])).toBe('Uno. Dos.')
  })
})
