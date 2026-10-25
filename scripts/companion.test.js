// El compañero y su exp por actividad (ver src/lib/companion.ts y dragonLevel.ts).
import { describe, expect, it } from 'vitest'
import { companeroDe, porMensaje, ganadoHoy, EXP_POR_MSG, ESPERA, TOPE_DIA } from '../src/lib/companion.ts'
import { aplicarExp, expForLevel, STAGE3_LEVEL } from '../src/lib/dragonLevel.ts'

const dragon = (hatchedAt, level, extra = {}) => ({
  id: 1, slug: 'x', name: `D${hatchedAt}`, level, exp: 0, stage: level >= STAGE3_LEVEL ? 3 : 1,
  hatchedAt, lastCollect: 0, ...extra,
})
const T0 = Date.UTC(2026, 9, 24, 12, 0, 0)

describe('companeroDe', () => {
  it('el elegido, por hatchedAt; si no, el de más nivel', () => {
    const u = { dragons: [dragon(1, 3), dragon(2, 9), dragon(3, 5)] }
    expect(companeroDe(u).hatchedAt).toBe(2)
    expect(companeroDe({ ...u, companero: 3 }).hatchedAt).toBe(3)
  })

  it('si el elegido ya no está (liberado, subastado), vuelve al de más nivel', () => {
    expect(companeroDe({ dragons: [dragon(1, 3), dragon(2, 9)], companero: 99 }).hatchedAt).toBe(2)
  })

  it('sin dragones, ninguno', () => {
    expect(companeroDe({ dragons: [] })).toBeUndefined()
  })
})

describe('porMensaje', () => {
  it('gana poco por mensaje, con espera entre uno y otro', () => {
    const u = { dragons: [dragon(1, 2)] }
    expect(porMensaje(u, T0)).toBe(EXP_POR_MSG)
    expect(porMensaje(u, T0 + ESPERA - 1)).toBe(0)
    expect(porMensaje(u, T0 + ESPERA)).toBe(EXP_POR_MSG)
    expect(u.dragons[0].exp).toBe(EXP_POR_MSG * 2)
  })

  it('con tope por día, que se reinicia al día siguiente', () => {
    const u = { dragons: [dragon(1, 2)] }
    let t = T0
    let total = 0
    for (let i = 0; i < 500; i++) { total += porMensaje(u, t); t += ESPERA }
    // 500 mensajes espaciados cruzan la medianoche UTC: dos días de tope como mucho.
    const hoy = ganadoHoy(u, t - ESPERA)
    expect(total).toBeLessThanOrEqual(TOPE_DIA * 2)
    expect(hoy).toBeLessThanOrEqual(TOPE_DIA)
  })

  it('el spam no rinde: mil mensajes en un minuto dan lo mismo que dos', () => {
    const u = { dragons: [dragon(1, 2)] }
    let total = 0
    for (let i = 0; i < 1000; i++) total += porMensaje(u, T0 + i * 60)
    expect(total).toBe(EXP_POR_MSG * 2)
  })

  it('no lo hace evolucionar: eso queda para alimentarlo', () => {
    const d = dragon(1, STAGE3_LEVEL - 1, { exp: expForLevel(STAGE3_LEVEL - 1) - 1 })
    const u = { dragons: [d] }
    porMensaje(u, T0)
    expect(d.level).toBe(STAGE3_LEVEL - 1)
    expect(d.stage).toBe(1)
  })

  it('a uno ya evolucionado lo sigue subiendo', () => {
    const d = dragon(1, 30, { exp: expForLevel(30) - 1 })
    porMensaje({ dragons: [d] }, T0)
    expect(d.level).toBe(31)
  })
})

describe('aplicarExp', () => {
  it('sube varios niveles si alcanza, y avisa la evolución final', () => {
    const d = dragon(1, STAGE3_LEVEL - 1)
    const r = aplicarExp(d, expForLevel(STAGE3_LEVEL - 1) + expForLevel(STAGE3_LEVEL))
    expect(d.level).toBe(STAGE3_LEVEL + 1)
    expect(r.evolvedToFinal).toBe(true)
  })

  it('con tope, no lo pasa ni guarda exp para pasarlo', () => {
    const d = dragon(1, 5)
    aplicarExp(d, 100_000, 7)
    expect(d.level).toBe(7)
    expect(d.exp).toBeLessThan(expForLevel(7))
  })
})
