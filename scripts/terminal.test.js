// Cortar al ancho de la terminal (ver src/lib/terminal.ts).
import { describe, expect, it } from 'vitest'
import { anchoTexto, cortar } from '../src/lib/terminal.ts'

describe('anchoTexto', () => {
  it('ASCII uno, emojis e ideogramas dos, combinantes cero', () => {
    expect(anchoTexto('hola')).toBe(4)
    expect(anchoTexto('😂')).toBe(2)
    expect(anchoTexto('日本')).toBe(4)
    expect(anchoTexto('é')).toBe(1) // e + acento combinante
    expect(anchoTexto('❤️')).toBe(2) // corazón + selector de variante
  })
})

describe('cortar', () => {
  it('lo que entra queda igual', () => {
    expect(cortar('hola', 10)).toBe('hola')
    expect(cortar('hola', 4)).toBe('hola')
  })
  it('lo que no entra termina en … sin pasarse', () => {
    expect(cortar('hola mundo', 6)).toBe('hola …')
    expect(anchoTexto(cortar('hola mundo', 6))).toBe(6)
  })
  it('no parte un emoji ni se pasa por él', () => {
    const c = cortar('ab😂😂😂', 5)
    expect(anchoTexto(c)).toBeLessThanOrEqual(5)
    expect(c.endsWith('…')).toBe(true)
    expect([...c].every(ch => ch !== '�')).toBe(true)
  })
  it('los saltos de línea pasan a espacios', () => {
    expect(cortar('a\nb\tc', 10)).toBe('a b c')
  })
  it('sin lugar, nada', () => {
    expect(cortar('hola', 0)).toBe('')
  })
})
