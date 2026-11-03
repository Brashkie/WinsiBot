// La copia en TypeScript de Phone_Guard (src/lib/phoneGuard.ts) contra los
// casos que genera Rust (crates/session-api/src/phone.rs, que a su vez se
// compara contra Ada/SPARK): las tres dan lo mismo.
import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it } from 'vitest'
import {
  buscarNumeros, conocer, enmascarar, jidParaLog, leerJid, logNumerosCompletos,
  olvidarConocidos, tapar, textoParaLog,
} from '../src/lib/phoneGuard.ts'

const vectores = JSON.parse(readFileSync(new URL('./phone_guard.vectors.json', import.meta.url), 'utf8'))

afterEach(() => {
  olvidarConocidos()
  logNumerosCompletos(false)
})

describe('igual que Rust y Ada', () => {
  it.each(vectores.buscar)('buscar en $texto', ({ texto, numeros }) => {
    expect(buscarNumeros(texto)).toEqual(numeros)
  })
  it.each(vectores.jid)('leer $jid', ({ jid, leido }) => {
    expect(leerJid(jid)).toEqual(leido)
  })
})

describe('enmascarar', () => {
  it('deja ver dos y tres', () => {
    expect(enmascarar('51924360740')).toBe('51••••••740')
    expect(enmascarar('924360')).toBe('92•360')
    expect(enmascarar('12345')).toBeNull()
    expect(enmascarar('1'.repeat(21))).toBeNull()
  })
})

describe('tapar', () => {
  it('tapa solo los números conocidos, y no los permitidos', () => {
    conocer('51924360740@s.whatsapp.net')
    conocer('31908117356669@lid')
    conocer('120363363621316758@g.us') // un grupo no es de nadie
    const t = 'de +51 924 360 740 y @31908117356669, 10000000000 monedas, grupo 120363363621316758'
    expect(tapar(t, null, new Set())).toBe(
      'de 51••••••740 y @31•••••••••669, 10000000000 monedas, grupo 120363363621316758',
    )
    expect(tapar(t, null, new Set(['31908117356669']))).toBe(
      'de 51••••••740 y @31908117356669, 10000000000 monedas, grupo 120363363621316758',
    )
  })

  it('con los números que manda la Session API, en UTF-16', () => {
    conocer('51924360740@s.whatsapp.net')
    const t = '😄 ñ 51924360740'
    const desdeRust = vectores.buscar.find(v => v.texto.includes('😄')) // posiciones calculadas por Rust
    expect(desdeRust.numeros.length).toBeGreaterThan(0)
    expect(tapar(t, buscarNumeros(t), new Set())).toBe('😄 ñ 51••••••740')
  })
})

describe('log', () => {
  it('tapa los JID de personas, no los de grupos', () => {
    expect(jidParaLog('51924360740:3@s.whatsapp.net')).toBe('51••••••740:3@s.whatsapp.net')
    expect(jidParaLog('31908117356669@lid')).toBe('31•••••••••669@lid')
    expect(jidParaLog('120363363621316758@g.us')).toBe('120363363621316758@g.us')
    expect(jidParaLog('status@broadcast')).toBe('status@broadcast')
  })

  it('con LOG_NUMEROS=completo, nada', () => {
    logNumerosCompletos(true)
    conocer('51924360740@s.whatsapp.net')
    expect(jidParaLog('51924360740@s.whatsapp.net')).toBe('51924360740@s.whatsapp.net')
    expect(textoParaLog('51924360740')).toBe('51924360740')
  })
})
