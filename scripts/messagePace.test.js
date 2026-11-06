// El límite de silencio del watchdog de conexión zombie (ver
// src/lib/messagePace.ts): igual que antes con tráfico, mucho más paciente
// sin él.
import { describe, expect, it } from 'vitest'
import { LIMITE_MAX_MS, LIMITE_MIN_MS, RitmoMensajes } from '../src/lib/messagePace.ts'

const MIN = 60_000

describe('RitmoMensajes', () => {
  it('sin datos suficientes espera el máximo (3 h)', () => {
    const r = new RitmoMensajes()
    expect(r.limite()).toBe(LIMITE_MAX_MS)
    for (let i = 0; i < 8; i++) r.anotar(i * 5 * MIN)
    expect(r.limite()).toBe(LIMITE_MAX_MS) // 7 silencios: todavía no
    r.anotar(8 * 5 * MIN)
    expect(r.limite()).toBe(15 * MIN) // 8 silencios de 5 min: 3 × 5
  })

  it('con mucho tráfico queda en 10 minutos, como siempre', () => {
    const r = new RitmoMensajes()
    // Un mensaje cada 2 s durante una hora: se anota uno por minuto.
    for (let t = 0; t < 60 * MIN; t += 2_000) r.anotar(t)
    expect(r.limite()).toBe(LIMITE_MIN_MS)
  })

  it('con pocos grupos tranquilos espera bastante más que 10 minutos', () => {
    const r = new RitmoMensajes()
    // Un mensaje cada 20 a 40 minutos.
    let t = 0
    for (let i = 0; i < 30; i++) { t += (20 + (i % 3) * 10) * MIN; r.anotar(t) }
    expect(r.limite()).toBe(3 * 40 * MIN)
    // Y nunca más de 3 h, aunque hablen cada 2 h.
    const lento = new RitmoMensajes()
    for (let i = 0; i < 20; i++) lento.anotar(i * 120 * MIN)
    expect(lento.limite()).toBe(LIMITE_MAX_MS)
  })

  it('una ráfaga (o el backlog) no achica el límite', () => {
    const r = new RitmoMensajes()
    let t = 0
    for (let i = 0; i < 20; i++) { t += 30 * MIN; r.anotar(t) }
    const antes = r.limite()
    for (let k = 0; k < 500; k++) r.anotar(t + k * 100) // 500 mensajes en 50 s
    expect(r.limite()).toBe(antes)
  })
})
