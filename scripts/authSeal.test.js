// La sesión sellada (src/lib/authSeal.ts y authStateCbor.ts).
//
// 1. Node sella y abre igual que la Session API: los vectores los genera Rust
//    (crates/session-api/src/seal.rs), donde sella SPARKNaCl con la feature
//    `ada` y la copia en Rust sin ella, comparadas entre sí. Con el mismo nonce,
//    Node tiene que dar los mismos bytes.
// 2. Lo que nunca tiene que pasar: que falte la clave, o que sea otra, y el bot
//    tome la sesión por rota y pida QR, o borre archivos.
import { randomBytes } from 'node:crypto'
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { encode as cborEncode, decode as cborDecode } from 'cbor-x'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@core/logger.js', () => ({ logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} } }))
// Sin Session API: si algo pidiera la clave de verdad, que conteste que no la tiene.
vi.mock('../src/lib/rustHttp.ts', () => ({ rustRequest: async () => ({ status: 503, data: { ok: false, error: 'test' } }) }))

const seal = await import('../src/lib/authSeal.ts')
const { useMultiFileAuthStateCBOR } = await import('../src/lib/authStateCbor.ts')
const vectores = JSON.parse(readFileSync(new URL('./auth_seal.vectors.json', import.meta.url), 'utf8'))

const hex = h => Buffer.from(h, 'hex')
let carpetas = []
function carpeta() {
  const d = join(tmpdir(), `winsi-authseal-${process.pid}-${carpetas.length}`)
  rmSync(d, { recursive: true, force: true })
  mkdirSync(d, { recursive: true })
  carpetas.push(d)
  return d
}
afterEach(() => {
  for (const d of carpetas) rmSync(d, { recursive: true, force: true })
  carpetas = []
})

describe('igual que la Session API (Rust y Ada)', () => {
  it.each(vectores.casos)('caso $aad', ({ clave, nonce, aad, texto, sellado }) => {
    const a = Buffer.from(aad, 'utf8')
    expect(seal.sellar(hex(clave), a, hex(texto), hex(nonce)).toString('hex')).toBe(sellado)
    expect(seal.abrir(hex(clave), a, hex(sellado)).toString('hex')).toBe(texto)
  })
})

describe('sellar y abrir', () => {
  const k = randomBytes(32)
  const aad = seal.aadAuth('creds.cbor')

  it('no abre con otra clave, otro nombre ni un byte cambiado', () => {
    const s = seal.sellar(k, aad, Buffer.from('{"noiseKey":1}'))
    expect(seal.abrir(k, aad, s).toString()).toBe('{"noiseKey":1}')
    expect(() => seal.abrir(randomBytes(32), aad, s)).toThrow(seal.ErrorSello)
    expect(() => seal.abrir(k, seal.aadAuth('pre-key-1.cbor'), s)).toThrow(seal.ErrorSello)
    for (let i = 4; i < s.length; i++) {
      const mal = Buffer.from(s)
      mal[i] ^= 1
      expect(() => seal.abrir(k, aad, mal)).toThrow(seal.ErrorSello)
    }
  })

  it('la copia de creds se abre como creds', () => {
    const s = seal.guardarArchivo(k, 'creds.cbor', Buffer.from('x'))
    expect(seal.abrirArchivo(k, 'creds.cbor.bak', s).toString()).toBe('x')
  })

  it('lo de antes, en claro, se lee igual', () => {
    expect(seal.abrirArchivo(null, 'creds.cbor', Buffer.from('claro')).toString()).toBe('claro')
  })

  it('sellado y sin clave: sin-clave, no "roto"', () => {
    const s = seal.sellar(k, aad, Buffer.from('x'))
    try {
      seal.abrirArchivo(null, 'creds.cbor', s)
      expect.unreachable()
    } catch (e) {
      expect(e.motivo).toBe('sin-clave')
    }
  })
})

/** Una sesión de antes de la 9.5: en claro, como la dejaba el bot. */
function sesionEnClaro(dir) {
  const creds = { noiseKey: { private: Buffer.alloc(32, 1), public: Buffer.alloc(32, 2) }, registrationId: 7 }
  writeFileSync(join(dir, 'creds.cbor'), cborEncode(creds))
  writeFileSync(join(dir, 'creds.cbor.bak'), cborEncode(creds))
  for (let i = 1; i <= 5; i++) writeFileSync(join(dir, `pre-key-${i}.cbor`), cborEncode({ i }))
  return creds
}

describe('la sesión en el disco', () => {
  it('con clave, lo que estaba en claro queda sellado y se sigue leyendo', async () => {
    const dir = carpeta()
    sesionEnClaro(dir)
    const k = randomBytes(32)
    const { state } = await useMultiFileAuthStateCBOR(dir, { clave: k })
    expect(state.creds.registrationId).toBe(7)
    for (const f of readdirSync(dir)) {
      expect(seal.estaSellado(readFileSync(join(dir, f))), f).toBe(true)
    }
    expect((await state.keys.get('pre-key', ['3']))['3']).toEqual({ i: 3 })
    // Nada de la clave privada queda a la vista en el disco.
    const bytes = readdirSync(dir).map(f => readFileSync(join(dir, f)))
    expect(bytes.some(b => b.includes(Buffer.alloc(32, 1)))).toBe(false)
    // Lo que escribe de ahí en más, también sellado.
    await state.keys.set({ 'pre-key': { 9: { nueva: true } } })
    const nueva = readFileSync(join(dir, 'pre-key-9.cbor'))
    expect(seal.estaSellado(nueva)).toBe(true)
    expect(cborDecode(seal.abrirArchivo(k, 'pre-key-9.cbor', nueva))).toEqual({ nueva: true })
  })

  it('sellada y sin clave: no arranca, y no toca ningún archivo', async () => {
    const dir = carpeta()
    sesionEnClaro(dir)
    await useMultiFileAuthStateCBOR(dir, { clave: randomBytes(32) })
    const antes = readdirSync(dir).map(f => [f, readFileSync(join(dir, f)).toString('hex')])

    await expect(useMultiFileAuthStateCBOR(dir, { clave: null })).rejects.toThrow(/sellada/)
    // Y lo mismo si la clave se le pide a la Session API y no la da.
    await expect(useMultiFileAuthStateCBOR(dir)).rejects.toThrow(/sellada/)
    expect(readdirSync(dir).map(f => [f, readFileSync(join(dir, f)).toString('hex')])).toEqual(antes)
  })

  it('con otra clave: no pide QR ni aparta creds', async () => {
    const dir = carpeta()
    sesionEnClaro(dir)
    await useMultiFileAuthStateCBOR(dir, { clave: randomBytes(32) })
    const antes = readdirSync(dir).sort()

    await expect(useMultiFileAuthStateCBOR(dir, { clave: randomBytes(32) })).rejects.toThrow(/otro vault.key/)
    expect(readdirSync(dir).sort()).toEqual(antes)
  })

  it('creds dañado con la clave correcta: se recupera del .bak, como antes', async () => {
    const dir = carpeta()
    sesionEnClaro(dir)
    const k = randomBytes(32)
    await useMultiFileAuthStateCBOR(dir, { clave: k })
    const ruta = join(dir, 'creds.cbor')
    const mal = readFileSync(ruta)
    mal[mal.length - 1] ^= 1
    writeFileSync(ruta, mal)

    const { state } = await useMultiFileAuthStateCBOR(dir, { clave: k })
    expect(state.creds.registrationId).toBe(7)
  })
})
