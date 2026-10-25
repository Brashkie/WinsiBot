// La forja (ver src/lib/forge.ts).
import { describe, expect, it } from 'vitest'
import {
  MAX_NIVEL, NIVEL_RIESGO, costo, probabilidad, intentar, bonoArma, faltante,
} from '../src/lib/forge.ts'

const siempre = () => 0        // sale todo
const nunca   = () => 0.9999   // falla todo (salvo el 100%)

describe('intentar', () => {
  it('éxito sube uno', () => {
    expect(intentar(0, false, siempre)).toEqual({ exito: true, nivel: 1, usoProteccion: false })
    expect(intentar(9, false, siempre).nivel).toBe(10)
  })

  it('+0 → +1 nunca falla', () => {
    expect(intentar(0, false, nunca).exito).toBe(true)
  })

  it('fallar antes del riesgo solo pierde materiales', () => {
    expect(intentar(NIVEL_RIESGO - 1, false, nunca)).toEqual({ exito: false, nivel: NIVEL_RIESGO - 1, usoProteccion: false })
  })

  it('fallar desde el riesgo baja uno, salvo con protección', () => {
    expect(intentar(NIVEL_RIESGO, false, nunca).nivel).toBe(NIVEL_RIESGO - 1)
    expect(intentar(NIVEL_RIESGO, true, nunca)).toEqual({ exito: false, nivel: NIVEL_RIESGO, usoProteccion: true })
  })

  it('la protección no se gasta si sale bien', () => {
    expect(intentar(7, true, siempre).usoProteccion).toBe(false)
  })

  it('en el máximo no hace nada', () => {
    expect(intentar(MAX_NIVEL, false, siempre)).toEqual({ exito: false, nivel: MAX_NIVEL, usoProteccion: false })
  })

  it('nunca baja de 0 ni rompe el arma', () => {
    for (let n = 0; n < MAX_NIVEL; n++) expect(intentar(n, false, nunca).nivel).toBeGreaterThanOrEqual(Math.max(0, n - 1))
  })
})

describe('costo y probabilidad', () => {
  it('cada +1 cuesta más y sale menos', () => {
    for (let n = 1; n < MAX_NIVEL; n++) {
      expect(costo(n).dinero).toBeGreaterThan(costo(n - 1).dinero)
      expect(probabilidad(n)).toBeLessThanOrEqual(probabilidad(n - 1))
    }
  })

  it('los legendarios solo desde +6', () => {
    expect(costo(5).legendarios).toBe(0)
    expect(costo(6).legendarios).toBe(1)
  })
})

describe('bonoArma', () => {
  it('+8% por nivel, con tope', () => {
    expect(bonoArma(0)).toBe(1)
    expect(bonoArma(5)).toBeCloseTo(1.4)
    expect(bonoArma(99)).toBeCloseTo(1.8)
  })
})

describe('faltante', () => {
  it('lista lo que falta', () => {
    const c = { espadas: 2, sp: 3, legendarios: 1, dinero: 1000 }
    expect(faltante(c, { sword: 2, sp: 3, legendary: 1 }, 1000)).toEqual([])
    expect(faltante(c, { sword: 0, sp: 3, legendary: 0 }, 400)).toEqual(['2 ⚔️', '1 🏆', '¥600'])
  })
})
