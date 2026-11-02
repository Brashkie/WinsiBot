// ¿Le hablan al bot por su nombre? (ver src/lib/aiTrigger.ts)
import { describe, expect, it } from 'vitest'
import { nombraAlBot } from '../src/lib/aiTrigger.ts'

const n = ['hepein', 'WinsiBot']

describe('nombraAlBot', () => {
  it('el nombre como palabra suelta, en cualquier lugar', () => {
    for (const t of ['hepein sos toxico?', 'oye hepein, qué hora es', '¿qué opinas hepein?', 'HEPEIN', 'hola winsibot', '@hepein ayuda']) {
      expect(nombraAlBot(t, n), t).toBe(true)
    }
  })

  it('no cuando otro bot cita un comando, ni dentro de otra palabra', () => {
    for (const t of [
      '《✧》 El comando *hepein* no existe. Para ver la lista',
      'usa `hepein` así',
      '_hepein_',
      '~hepein~',
      '#hepein mode toxico',
      'hepeinazo',
      'superhepein',
      'nada que ver',
    ]) {
      expect(nombraAlBot(t, n), t).toBe(false)
    }
  })
})
