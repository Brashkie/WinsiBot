// Las menciones que el bot repite (ver src/lib/mentions.ts).
import { beforeEach, describe, expect, it } from 'vitest'
import { anotar, completar, mencionesDe, olvidarTodo } from '../src/lib/mentions.ts'

describe('menciones', () => {
  beforeEach(() => olvidarTodo())

  it('completa las menciones de un texto con los jids que se vieron llegar', () => {
    anotar(['160305996898368@lid', '64017141887125:12@lid', '51999888777@s.whatsapp.net'])
    const c = completar({ text: 'Razón: detonando el papoi de @160305996898368', mentions: ['64017141887125@lid'] })
    expect(c.mentions).toEqual(['64017141887125@lid', '160305996898368@lid'])
    expect(mencionesDe('hola @64017141887125 y @51999888777')).toEqual(['64017141887125@lid', '51999888777@s.whatsapp.net'])
  })

  it('no inventa menciones ni toca lo que no hace falta', () => {
    anotar(['160305996898368@lid'])
    const sin = { text: 'nadie: @123456789 y @55' }
    expect(completar(sin)).toBe(sin)
    const ya = { text: '@160305996898368', mentions: ['160305996898368@lid'] }
    expect(completar(ya)).toBe(ya)
    expect(completar({ image: {}, caption: 'de @160305996898368' }).mentions).toEqual(['160305996898368@lid'])
    expect(completar(null)).toBe(null)
  })
})
