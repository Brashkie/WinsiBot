// Los montos de los comandos de economía (ver src/lib/amount.ts).
import { describe, expect, it } from 'vitest'
import { montoDe } from '../src/lib/amount.ts'

describe('montoDe', () => {
  it('dígitos, con o sin separador de miles', () => {
    expect(montoDe('500')).toBe(500)
    expect(montoDe(' 500 ')).toBe(500)
    expect(montoDe('1.000')).toBe(1000) // antes: 1
    expect(montoDe('1,000')).toBe(1000)
    expect(montoDe('1 000 000')).toBe(1000000)
    expect(montoDe('1_000')).toBe(1000)
    expect(montoDe('0')).toBe(0)
  })

  it('lo que no es un monto da NaN, que cada comando ya rechaza', () => {
    for (const t of ['', '   ', 'abc', '12abc', '0x10', '1e9', '-5', '1.5', '1.00', '10.0000', '1.000,000', '1..000', undefined, null]) {
      expect(montoDe(t), String(t)).toBeNaN()
    }
  })

  it('nada de Infinity ni números que no entran exactos', () => {
    expect(montoDe('9'.repeat(400))).toBeNaN() // parseInt daba Infinity
    expect(montoDe('99999999999999999999')).toBeNaN()
    expect(montoDe(String(Number.MAX_SAFE_INTEGER))).toBe(Number.MAX_SAFE_INTEGER)
  })
})
