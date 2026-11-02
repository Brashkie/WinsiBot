// Los montos de los comandos de economía (ver src/lib/amount.ts).
import { describe, expect, it } from 'vitest'
import { MAX_LARGO, montoDe } from '../src/lib/amount.ts'

// La huella de la regla de Ada sobre todas las tiras de hasta 7 caracteres de
// ALFABETO: la misma constante que HUELLA en crates/session-api/src/amount.rs,
// donde el test la saca de Ada. Si cambia la regla, cambian las dos.
const HUELLA = 1_033_130_042
const ALFABETO = '059.,_ x'

// El mismo recorrido que `huella` en amount.rs: por largo, y cada largo como
// un número en base 8 con el primer carácter como la cifra más alta.
function huella(leer) {
  let h = 0x811c9dc5
  for (let largo = 0; largo <= 7; largo++) {
    const total = 8 ** largo
    for (let k = 0; k < total; k++) {
      let tira = ''
      for (let i = 0, x = k; i < largo; i++, x = Math.floor(x / 8)) tira = ALFABETO[x % 8] + tira
      const v = leer(tira)
      const r = Number.isNaN(v) ? 0xffffffff : v
      h = Math.imul((h ^ r) >>> 0, 0x01000193) >>> 0
    }
  }
  return h
}

describe('montoDe', () => {
  it('dígitos, con o sin separador de miles', () => {
    expect(montoDe('500')).toBe(500)
    expect(montoDe(' 500 ')).toBe(500)
    expect(montoDe('1.000')).toBe(1000) // antes: 1
    expect(montoDe('1,000')).toBe(1000)
    expect(montoDe('1 000 000')).toBe(1000000)
    expect(montoDe('1_000')).toBe(1000)
    expect(montoDe('0')).toBe(0)
    expect(montoDe('9,007,199,254,740,991')).toBe(Number.MAX_SAFE_INTEGER)
  })

  it('lo que no es un monto da NaN, que cada comando ya rechaza', () => {
    for (const t of ['', '   ', 'abc', '12abc', '0x10', '1e9', '-5', '1.5', '1.00', '10.0000', '1.000,000', '1..000', undefined, null]) {
      expect(montoDe(t), String(t)).toBeNaN()
    }
  })

  it('nada de Infinity ni números que no entran exactos', () => {
    expect(montoDe('9'.repeat(400))).toBeNaN() // parseInt daba Infinity
    expect(montoDe('99999999999999999999')).toBeNaN()
    expect(montoDe('9007199254740992')).toBeNaN()
    expect(montoDe(String(Number.MAX_SAFE_INTEGER))).toBe(Number.MAX_SAFE_INTEGER)
    expect(montoDe(`${'0'.repeat(MAX_LARGO)}1`)).toBeNaN() // 33 caracteres
  })

  it('da lo mismo que la regla demostrada en Ada, en 2.396.745 tiras', () => {
    expect(huella(montoDe)).toBe(HUELLA)
  })
})
