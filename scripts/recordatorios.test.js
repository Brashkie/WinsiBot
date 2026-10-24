// parsearCuando: el "cuándo" de #recordar (ver src/lib/cuando.ts).
import { describe, expect, it } from 'vitest'
import { parsearCuando, falta } from '../src/lib/cuando.ts'

const MIN = 60_000
const HORA = 60 * MIN
// Un miércoles a las 15:00, hora local.
const AHORA = new Date(2026, 9, 21, 15, 0, 0, 0)
const t0 = AHORA.getTime()
const p = (s) => parsearCuando(s, AHORA)

describe('parsearCuando', () => {
  it('duraciones compactas', () => {
    expect(p('10m sacar la ropa')).toEqual({ at: t0 + 10 * MIN, resto: 'sacar la ropa' })
    expect(p('2h llamar')?.at).toBe(t0 + 2 * HORA)
    expect(p('1h30m algo')?.at).toBe(t0 + 90 * MIN)
    expect(p('90min algo')?.at).toBe(t0 + 90 * MIN)
    expect(p('1d algo')?.at).toBe(t0 + 24 * HORA)
    expect(p('en 5m algo')?.at).toBe(t0 + 5 * MIN)
  })

  it('duraciones en palabras', () => {
    expect(p('en 10 minutos el horno')).toEqual({ at: t0 + 10 * MIN, resto: 'el horno' })
    expect(p('3 días pagar la luz')?.at).toBe(t0 + 72 * HORA)
    expect(p('2 horas algo')?.at).toBe(t0 + 2 * HORA)
  })

  it('hora del día: hoy si no pasó, mañana si ya pasó', () => {
    expect(p('18:30 partido')?.at).toBe(new Date(2026, 9, 21, 18, 30).getTime())
    expect(p('a las 18:30 partido')?.resto).toBe('partido')
    expect(p('9:00 desayuno')?.at).toBe(new Date(2026, 9, 22, 9, 0).getTime())
    expect(p('hoy 16:00 algo')?.at).toBe(new Date(2026, 9, 21, 16, 0).getTime())
  })

  it('am / pm', () => {
    expect(p('7pm cena')?.at).toBe(new Date(2026, 9, 21, 19, 0).getTime())
    expect(p('12am algo')?.at).toBe(new Date(2026, 9, 22, 0, 0).getTime())
  })

  it('mañana', () => {
    expect(p('mañana 9:00 reunión')).toEqual({
      at: new Date(2026, 9, 22, 9, 0).getTime(), resto: 'reunión',
    })
    // A una hora que hoy aún no pasó, "mañana" sigue siendo mañana.
    expect(p('mañana 18:00 algo')?.at).toBe(new Date(2026, 9, 22, 18, 0).getTime())
    expect(p('mañana pagar')?.at).toBe(t0 + 24 * HORA)
  })

  it('sin qué recordar, o sin cuándo, no hay recordatorio', () => {
    expect(p('10m')).toBeNull()
    expect(p('sacar la ropa')).toBeNull()
    expect(p('')).toBeNull()
    expect(p('25:00 algo')).toBeNull()
    expect(p('10x algo')).toBeNull()
    // Un número suelto no es una hora: "3 cosas" no es "a las 3".
    expect(p('3 cosas que comprar')).toBeNull()
  })

  it('"30s" no se lee como 30 semanas', () => {
    expect(p('30s algo')).toBeNull()
  })
})

describe('falta', () => {
  it('formatea lo que falta', () => {
    expect(falta(30_000)).toBe('menos de un minuto')
    expect(falta(10 * MIN)).toBe('10 min')
    expect(falta(2 * HORA + 5 * MIN)).toBe('2 h 5 min')
    expect(falta(26 * HORA)).toBe('1 d 2 h')
  })
})
