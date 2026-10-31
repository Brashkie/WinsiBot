// El pack y el autor de los stickers (ver src/lib/webpExif.ts): que se escriban
// en los cuatro tipos de WebP que salen de sharp y de ffmpeg, sin tocar un
// píxel, y que se lean de vuelta.
//
// Antes de sacar `wa-sticker-formatter` se comparó contra ella: el mismo EXIF
// byte a byte, y el mismo tamaño de archivo resultante en los cuatro tipos.
import { describe, expect, it } from 'vitest'
import sharp from 'sharp'
import { armarExif, escribirExif, leerExif } from '../src/lib/webpExif.ts'

const cuadro = (c) => sharp({ create: { width: 37, height: 21, channels: 4, background: c } }).png().toBuffer()
const casos = async () => ({
  // VP8 simple: con pérdida, sin transparencia.
  conPerdida: await sharp({ create: { width: 37, height: 21, channels: 3, background: '#f00' } }).webp({ quality: 50 }).toBuffer(),
  // VP8L simple: sin pérdida.
  sinPerdida: await sharp({ create: { width: 37, height: 21, channels: 3, background: '#0f0' } }).webp({ lossless: true }).toBuffer(),
  // VP8X ya extendido, por la transparencia.
  transparente: await sharp({ create: { width: 37, height: 21, channels: 4, background: { r: 0, g: 0, b: 255, alpha: 0.5 } } }).webp().toBuffer(),
  animado: await sharp([await cuadro('#f00'), await cuadro('#0f0')], { join: { animated: true } }).webp({ loop: 0, delay: [100, 100] }).toBuffer(),
})
const pixeles = (b) => sharp(b, { animated: true }).raw().toBuffer()

describe('webpExif', () => {
  it('escribe y lee el pack y el autor en los cuatro tipos, sin tocar la imagen', async () => {
    for (const [nombre, w] of Object.entries(await casos())) {
      const con = escribirExif(w, { pack: 'Mi pack ñ 😀', author: 'Yo' })
      const meta = leerExif(con)
      expect(meta?.['sticker-pack-name'], nombre).toBe('Mi pack ñ 😀')
      expect(meta?.['sticker-pack-publisher'], nombre).toBe('Yo')
      expect((await pixeles(con)).equals(await pixeles(w)), nombre).toBe(true)
      // sharp lo sigue leyendo con el mismo tamaño.
      const m = await sharp(con, { animated: true }).metadata()
      expect([m.width, m.pageHeight ?? m.height], nombre).toEqual([37, 21])
    }
  })

  it('reescribir deja un solo EXIF, con lo último', async () => {
    const { animado } = await casos()
    const dos = escribirExif(escribirExif(animado, { pack: 'A', author: 'a' }), { pack: 'B', author: 'b' })
    expect(leerExif(dos)?.['sticker-pack-name']).toBe('B')
    expect(dos.toString('latin1').split('EXIF').length - 1).toBe(1)
  })

  it('la cabecera es la que WhatsApp espera: TIFF little-endian, el JSON en el byte 22', () => {
    const exif = armarExif({ pack: 'p', author: 'a' }, 'id')
    expect([...exif.subarray(0, 4)]).toEqual([0x49, 0x49, 0x2a, 0x00])
    const largo = exif.readUInt32LE(14)
    expect(JSON.parse(exif.toString('utf-8', 22, 22 + largo))).toEqual({
      'sticker-pack-id': 'id', 'sticker-pack-name': 'p', 'sticker-pack-publisher': 'a', emojis: [],
    })
  })

  it('lo que no es un WebP no se toca', () => {
    expect(() => escribirExif(Buffer.from('no soy un webp, soy texto'), { pack: 'p', author: 'a' })).toThrow()
    expect(() => leerExif(Buffer.from('nada'))).toThrow()
  })

  it('un sticker sin EXIF se lee como null', async () => {
    expect(leerExif((await casos()).conPerdida)).toBeNull()
  })
})
