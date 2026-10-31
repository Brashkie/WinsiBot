// Los QR del bot (ver src/lib/qr.ts): el de vincular, en la consola, y el de
// los sub-bots, como imagen.
//
// Antes de sacar `qrcode` se comparó contra ella en modo byte con 350 textos
// —versiones 1 a 23, incluidos 50 con la forma del QR de Baileys—: la misma
// matriz, versión y máscara, el mismo texto de consola y el mismo PNG. Las
// huellas de abajo son de QR que la librería confirmó: si algo cambia un solo
// módulo, este test lo dice.
import { describe, expect, it } from 'vitest'
import { createHash } from 'crypto'
import sharp from 'sharp'
import { qr, qrPng, qrTerminal } from '../src/lib/qr.ts'

const huella = (q) => createHash('sha256').update(Buffer.from(q.modulos)).digest('hex').slice(0, 32)

describe('qr', () => {
  it('da los mismos QR que confirmó la librería', () => {
    const casos = [
      ['https://github.com/Brashkie/WinsiBot', 3, 1, 'ee74a89b2b60cc961c34999abefeb11f'],
      ['ñandú 🐉 dragón', 2, 2, 'de9a5dc32ed61ed3e91cd113a0865a7c'],
      // Del largo del QR de Baileys: versión 11, varios bloques, largo de 16 bits.
      ['2@' + 'aB3+/'.repeat(48) + ',xyz=', 11, 3, '0cae7da7e72838dbf22039e843c7f907'],
      ['x'.repeat(600), 19, 0, 'da2a418f0ae2dc0582ce8fc6ab9f8996'],
    ]
    for (const [texto, version, mascara, h] of casos) {
      const q = qr(texto)
      expect([q.version, q.mascara, huella(q)], texto.slice(0, 20)).toEqual([version, mascara, h])
    }
  })

  it('el lado es 4·versión + 17, con los tres buscadores en su lugar', () => {
    const q = qr('WinsiBot')
    expect(q.lado).toBe(q.version * 4 + 17)
    const at = (f, c) => q.modulos[f * q.lado + c]
    for (const [f, c] of [[0, 0], [0, q.lado - 7], [q.lado - 7, 0]]) {
      // El anillo de afuera oscuro, el de adentro claro y el centro oscuro.
      expect([at(f, c), at(f + 1, c + 1), at(f + 3, c + 3)]).toEqual([1, 0, 1])
    }
  })

  it('demasiados datos: error, no un QR roto', () => {
    expect(() => qr('x'.repeat(3000))).toThrow()
  })

  it('la consola y el PNG salen del mismo QR', async () => {
    const t = 'https://github.com/Brashkie/WinsiBot'
    const q = qr(t)
    expect(qrTerminal(t).split('\n').length).toBe(Math.ceil((q.lado + 2) / 2) + 1)
    const m = await sharp(await qrPng(t, 8)).metadata()
    expect(m.width).toBe((q.lado + 8) * 8)
  })
})
