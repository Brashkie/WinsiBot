// Verificar las firmas de grupo con OpenSSL (ver src/lib/fastCurve.ts): se
// tienen que aceptar y rechazar EXACTAMENTE las mismas firmas que con
// curve25519-js.
import { randomBytes } from 'node:crypto'
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'
import { instalar, verificar } from '../src/lib/fastCurve.ts'

const require = createRequire(import.meta.url)
const c = require('curve25519-js')
instalar()
const curve = require('libsignal/src/curve.js')

const L = 2n ** 252n + 27742317777372353535851937790883648493n
const aNumero = (b) => b.reduceRight((n, x) => (n << 8n) | BigInt(x), 0n)
const aBytes = (n) => Uint8Array.from({ length: 32 }, (_, i) => Number((n >> BigInt(8 * i)) & 0xffn))
const conPrefijo = (pub) => Buffer.concat([Buffer.from([5]), Buffer.from(pub)])

describe('fastCurve', () => {
  it('OpenSSL acepta las firmas legítimas, sin pasar por curve25519-js', () => {
    for (let i = 0; i < 40; i++) {
      const kp = c.generateKeyPair(randomBytes(32))
      const msg = randomBytes(i * 7)
      expect(verificar(kp.public, msg, c.sign(kp.private, msg))).toBe(true)
    }
  })

  it('acepta y rechaza lo mismo que curve25519-js', () => {
    for (let i = 0; i < 40; i++) {
      const kp = c.generateKeyPair(randomBytes(32))
      const msg = randomBytes(1 + i * 5)
      const sig = Buffer.from(c.sign(kp.private, msg))
      const pub = conPrefijo(kp.public)
      expect(curve.verifySignature(pub, msg, sig)).toBe(true)
      // Un bit cambiado en la firma, en el mensaje o en la clave.
      const mala = Buffer.from(sig)
      mala[i % 64] ^= 1 << (i % 8)
      expect(curve.verifySignature(pub, msg, mala)).toBe(c.verify(kp.public, msg, mala))
      const otro = Buffer.from(msg.length ? msg : [0])
      otro[0] ^= 1
      expect(curve.verifySignature(pub, otro, sig)).toBe(c.verify(kp.public, otro, sig))
      const otraClave = Buffer.from(pub)
      otraClave[1 + (i % 32)] ^= 1 << (i % 7)
      expect(curve.verifySignature(otraClave, msg, sig)).toBe(c.verify(otraClave.subarray(1), msg, sig))
    }
  })

  it('una firma maleable (S + L), que tweetnacl acepta, también se acepta', () => {
    const kp = c.generateKeyPair(randomBytes(32))
    const msg = randomBytes(64)
    const sig = Buffer.from(c.sign(kp.private, msg))
    const signo = sig[63] & 128
    const s = aNumero(Uint8Array.from(sig.subarray(32, 64)).map((x, i) => (i === 31 ? x & 127 : x)))
    sig.set(aBytes(s + L), 32)
    sig[63] |= signo
    expect(c.verify(kp.public, msg, sig)).toBe(true)
    // OpenSSL la rechaza (S >= L) y decide curve25519-js.
    expect(verificar(kp.public, msg, sig)).toBe(null)
    expect(curve.verifySignature(conPrefijo(kp.public), msg, sig)).toBe(true)
  })

  it('claves raras (orden chico, cero, basura): lo mismo que curve25519-js', () => {
    const p = 2n ** 255n - 19n
    const raras = [0n, 1n, p - 1n, p, p + 1n, 2n ** 255n - 1n].map(aBytes)
    for (let i = 0; i < 4; i++) raras.push(randomBytes(32))
    const msg = randomBytes(40)
    for (const pub of raras) {
      for (const sig of [randomBytes(64), Buffer.alloc(64)]) {
        expect(curve.verifySignature(conPrefijo(pub), msg, sig)).toBe(c.verify(pub, msg, sig))
      }
    }
  })

  it('las validaciones de siempre siguen ahí', () => {
    const kp = c.generateKeyPair(randomBytes(32))
    const msg = randomBytes(10)
    const sig = Buffer.from(c.sign(kp.private, msg))
    expect(() => curve.verifySignature(conPrefijo(kp.public), msg, sig.subarray(0, 63))).toThrow()
    expect(curve.verifySignature(conPrefijo(kp.public), msg, Buffer.alloc(64), true)).toBe(true)
  })
})
