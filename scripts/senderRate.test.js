// El rate limit de cada mensaje, en memoria (src/lib/senderRate.ts): la misma
// regla que rate_limiter.rs, 15 por remitente cada 10 s.
import { describe, expect, it } from 'vitest'
import { LIMITE, LimitePorRemitente, VENTANA_MS } from '../src/lib/senderRate.ts'

describe('LimitePorRemitente', () => {
  it('deja pasar 15 y frena el 16 dentro de la ventana', () => {
    const l = new LimitePorRemitente()
    for (let i = 0; i < LIMITE; i++) expect(l.permitir('a', 1000 + i)).toBe(true)
    expect(l.permitir('a', 2000)).toBe(false)
    expect(l.permitir('a', 1000 + VENTANA_MS)).toBe(false) // todavía en la ventana
  })

  it('cuando vence la ventana, vuelve a dejar pasar', () => {
    const l = new LimitePorRemitente()
    for (let i = 0; i < 20; i++) l.permitir('a', 1000)
    expect(l.permitir('a', 1000 + VENTANA_MS + 1)).toBe(true)
  })

  it('cada remitente con su cuenta', () => {
    const l = new LimitePorRemitente()
    for (let i = 0; i < 20; i++) l.permitir('a', 1000)
    expect(l.permitir('b', 1000)).toBe(true)
  })

  it('no crece sin límite: se tiran las ventanas vencidas', () => {
    const l = new LimitePorRemitente()
    for (let i = 0; i < 5000; i++) l.permitir(`r${i}`, i * 10)
    // Con 10 ms entre uno y otro, en 10 s caben ~1000 vivos, más lo que
    // queda entre limpiezas.
    expect(l.tamano).toBeLessThan(2100)
    l.limpiar(5000 * 10 + VENTANA_MS + 1)
    expect(l.tamano).toBe(0)
  })
})
