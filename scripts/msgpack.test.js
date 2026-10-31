// El lector de MessagePack de los catálogos de #rw y de los dragones (ver
// src/lib/msgpack.ts). Antes de sacar @msgpack/msgpack se comparó contra ella
// con los cuatro catálogos de verdad de module-data: el mismo resultado, y
// 18,5 ms contra 23,6 en total. Acá, cada tipo armado a mano.
import { describe, expect, it } from 'vitest'
import { decodificar } from '../src/lib/msgpack.ts'

const mp = (...b) => new Uint8Array(b.flat())
const utf8 = (s) => [...new TextEncoder().encode(s)]

describe('decodificar', () => {
  it('enteros en todos sus anchos, con y sin signo', () => {
    expect(decodificar(mp(0x00))).toBe(0)
    expect(decodificar(mp(0x7f))).toBe(127)
    expect(decodificar(mp(0xff))).toBe(-1)
    expect(decodificar(mp(0xe0))).toBe(-32)
    expect(decodificar(mp(0xcc, 0xff))).toBe(255)
    expect(decodificar(mp(0xcd, 0x01, 0x00))).toBe(256)
    expect(decodificar(mp(0xce, 0x00, 0x01, 0x00, 0x00))).toBe(65536)
    expect(decodificar(mp(0xcf, 0, 0, 0, 1, 0, 0, 0, 0))).toBe(2 ** 32)
    expect(decodificar(mp(0xd0, 0x80))).toBe(-128)
    expect(decodificar(mp(0xd1, 0xff, 0x00))).toBe(-256)
    expect(decodificar(mp(0xd2, 0xff, 0xff, 0xff, 0xff))).toBe(-1)
    expect(decodificar(mp(0xd3, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xfe))).toBe(-2)
  })

  it('nil, booleanos y decimales', () => {
    expect(decodificar(mp(0xc0))).toBeNull()
    expect(decodificar(mp(0xc2))).toBe(false)
    expect(decodificar(mp(0xc3))).toBe(true)
    expect(decodificar(mp(0xca, 0x3f, 0xc0, 0x00, 0x00))).toBe(1.5)
    expect(decodificar(mp(0xcb, 0x40, 0x09, 0x21, 0xfb, 0x54, 0x44, 0x2d, 0x18))).toBe(Math.PI)
  })

  it('cadenas cortas y largas, con acentos y emojis', () => {
    expect(decodificar(mp(0xa3, utf8('abc')))).toBe('abc')
    const ñ = utf8('ñandú 🐉')
    expect(decodificar(mp(0xa0 | ñ.length, ñ))).toBe('ñandú 🐉')
    // str8 lleva hasta 255 bytes; str16, más.
    const medio = 'dragón '.repeat(20)
    const bm = utf8(medio)
    expect(decodificar(mp(0xd9, bm.length, bm))).toBe(medio)
    const largo = 'dragón '.repeat(40)
    const bl = utf8(largo)
    expect(decodificar(mp(0xda, bl.length >> 8, bl.length & 0xff, bl))).toBe(largo)
  })

  it('listas, mapas anidados y binarios', () => {
    // {"a":[1,"x"],"b":{"c":null}}
    expect(decodificar(mp(0x82, 0xa1, 0x61, 0x92, 0x01, 0xa1, 0x78, 0xa1, 0x62, 0x81, 0xa1, 0x63, 0xc0)))
      .toEqual({ a: [1, 'x'], b: { c: null } })
    expect(decodificar(mp(0xdc, 0x00, 0x02, 0x01, 0x02))).toEqual([1, 2])
    expect(decodificar(mp(0xde, 0x00, 0x01, 0xa1, 0x6b, 0x07))).toEqual({ k: 7 })
    expect(decodificar(mp(0xc4, 0x03, 0x01, 0x02, 0x03))).toEqual(new Uint8Array([1, 2, 3]))
  })

  it('las claves repetidas salen bien de la caché', () => {
    // [{"nombre":"a"},{"nombre":"b"},{"nombre":"c"}]
    const k = [0xa6, ...utf8('nombre')]
    const obj = (v) => [0x81, ...k, 0xa1, v.charCodeAt(0)]
    expect(decodificar(mp(0x93, obj('a'), obj('b'), obj('c')))).toEqual([{ nombre: 'a' }, { nombre: 'b' }, { nombre: 'c' }])
  })

  it('cortado o con un tipo que no se usa: error, no un valor inventado', () => {
    expect(() => decodificar(mp(0xa5, 0x61))).toThrow()
    expect(() => decodificar(mp(0x92, 0x01))).toThrow()
    expect(() => decodificar(mp(0xd4, 0x01, 0x02))).toThrow()
  })
})
