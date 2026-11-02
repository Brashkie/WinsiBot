// La protección de canales, la parte pura (src/lib/channelGuard.ts).
import { describe, expect, it } from 'vitest'
import { aRestaurar, leerCambio, leerCanal } from '../src/lib/channelGuard.ts'

const GUARDADO = { nombre: 'Canal Oficial', descripcion: 'Noticias del grupo' }

describe('leerCambio', () => {
  it('las dos formas en que llega', () => {
    expect(leerCambio({ name: 'Hackeado' })).toEqual({ nombre: 'Hackeado' })
    expect(leerCambio({ name: { text: 'Hackeado' }, description: { text: 'spam' } }))
      .toEqual({ nombre: 'Hackeado', descripcion: 'spam' })
    expect(leerCambio({ description: '' })).toEqual({ descripcion: '' })
  })

  it('lo que no se entiende, se ignora', () => {
    expect(leerCambio(null)).toEqual({})
    expect(leerCambio({ name: 5, picture: {} })).toEqual({})
  })
})

describe('aRestaurar', () => {
  it('vuelve atrás solo lo que cambió', () => {
    expect(aRestaurar(GUARDADO, { nombre: 'Hackeado' })).toEqual({ nombre: 'Canal Oficial' })
    expect(aRestaurar(GUARDADO, { descripcion: '' })).toEqual({ descripcion: 'Noticias del grupo' })
  })

  it('el aviso de la propia restauración no dispara otra: no hay bucle', () => {
    expect(aRestaurar(GUARDADO, { nombre: 'Canal Oficial', descripcion: 'Noticias del grupo' })).toBeNull()
    expect(aRestaurar(GUARDADO, {})).toBeNull()
  })
})

describe('leerCanal', () => {
  it('por jid o por link', () => {
    expect(leerCanal('120363012345678901@newsletter')).toEqual({ jid: '120363012345678901@newsletter' })
    expect(leerCanal('https://whatsapp.com/channel/0029VaAbCdEf123')).toEqual({ codigo: '0029VaAbCdEf123' })
    expect(leerCanal('hola')).toBeNull()
    expect(leerCanal('evil@newsletter')).toBeNull()
  })
})
