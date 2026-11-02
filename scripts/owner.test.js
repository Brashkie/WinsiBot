// Quién es dueño del bot (src/lib/owner.ts): la llave de #terminal y #exec.
import { describe, expect, it } from 'vitest'
import { esDueno, esLaCuentaDelBot } from '../src/lib/owner.ts'

const DUENOS = ['51911111111', '5491122223333@s.whatsapp.net']

describe('esDueno', () => {
  it('por su número, con o sin @ y con dispositivo', () => {
    expect(esDueno('51911111111@s.whatsapp.net', '', DUENOS)).toBe(true)
    expect(esDueno('5491122223333@s.whatsapp.net', '', DUENOS)).toBe(true)
    expect(esDueno('51911111111:7@s.whatsapp.net', '', DUENOS)).toBe(true)
  })

  it('llegando como @lid, por el teléfono que pone WhatsApp', () => {
    expect(esDueno('123456789@lid', '51911111111@s.whatsapp.net', DUENOS)).toBe(true)
  })

  it('un @lid cuyos dígitos son el número del dueño NO es el dueño', () => {
    // Hasta la 9.2 esto daba true: se comparaban los dígitos del @lid.
    expect(esDueno('51911111111@lid', '', DUENOS)).toBe(false)
    expect(esDueno('51911111111@lid', '51900000000@s.whatsapp.net', DUENOS)).toBe(false)
  })

  it('otro número no es el dueño, aunque lo contenga', () => {
    expect(esDueno('151911111111@s.whatsapp.net', '', DUENOS)).toBe(false)
    expect(esDueno('5191111111@s.whatsapp.net', '', DUENOS)).toBe(false)
    expect(esDueno('', '', DUENOS)).toBe(false)
  })

  it('sin dueños configurados, nadie', () => {
    expect(esDueno('51911111111@s.whatsapp.net', '', [])).toBe(false)
    expect(esDueno('51911111111@s.whatsapp.net', '', [''])).toBe(false)
  })

  it('un dueño configurado por su @lid vale solo exacto', () => {
    expect(esDueno('777@lid', '', ['777@lid'])).toBe(true)
    expect(esDueno('777@s.whatsapp.net', '', ['777@lid'])).toBe(false)
  })
})

describe('esLaCuentaDelBot', () => {
  const id = '51999888777:3@s.whatsapp.net'
  const lid = '31908117356669:3@lid'

  it('el teléfono del bot, desde otro dispositivo, por su @lid o su número', () => {
    expect(esLaCuentaDelBot('31908117356669@lid', id, lid)).toBe(true)
    expect(esLaCuentaDelBot('31908117356669:0@lid', id, lid)).toBe(true)
    expect(esLaCuentaDelBot('51999888777@s.whatsapp.net', id, lid)).toBe(true)
  })

  it('nunca un @lid contra el número, ni otra cuenta', () => {
    // Los dígitos del número del bot, como @lid: no es el bot.
    expect(esLaCuentaDelBot('51999888777@lid', id, lid)).toBe(false)
    expect(esLaCuentaDelBot('31908117356669@s.whatsapp.net', id, lid)).toBe(false)
    expect(esLaCuentaDelBot('113980009926909@lid', id, lid)).toBe(false)
    expect(esLaCuentaDelBot('', id, lid)).toBe(false)
    expect(esLaCuentaDelBot('31908117356669@lid', id, '')).toBe(false)
  })
})
