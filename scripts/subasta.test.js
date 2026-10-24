// Las reglas de las subastas (ver src/lib/subastaReglas.ts).
import { describe, expect, it } from 'vitest'
import { pujaMinima, alargar, neto, ANTI_ULTIMO, ITEMS } from '../src/lib/subastaReglas.ts'

describe('pujaMinima', () => {
  it('la base sin pujas; +5% con al menos ¥50 si hay', () => {
    expect(pujaMinima(1000, null)).toBe(1000)
    expect(pujaMinima(1000, 2000)).toBe(2100)
    expect(pujaMinima(100, 200)).toBe(250)
    expect(pujaMinima(100, 10_001)).toBe(10_001 + 501)
  })
})

describe('alargar', () => {
  it('una puja en el último minuto alarga hasta un minuto desde la puja', () => {
    const t = 1_000_000
    expect(alargar(t, t - 10_000)).toBe(t - 10_000 + ANTI_ULTIMO)
    expect(alargar(t, t - ANTI_ULTIMO - 1)).toBe(t)
  })
})

describe('neto', () => {
  it('descuenta el 5%', () => {
    expect(neto(1000)).toBe(950)
    expect(neto(999)).toBe(950)   // la comisión se redondea hacia abajo
  })
})

describe('ITEMS', () => {
  it('solo apunta a campos que existen en el inventario', () => {
    const validas = new Set(['sword', 'spada', 'pc', 'sp', 'legendary'])
    for (const it of Object.values(ITEMS)) expect(validas.has(it.clave)).toBe(true)
  })
})
