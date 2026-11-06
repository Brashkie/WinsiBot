// El pack y el autor de los stickers (ver src/lib/webpExif.ts): que se escriban
// en los cuatro tipos de WebP de un sticker, sin tocar la imagen, y que se
// lean de vuelta. Los WebP son de fixtures/images/ (hechos con sharp antes de
// sacarlo, en la 9.4.0).
//
// Antes de sacar `wa-sticker-formatter` se comparó contra ella: el mismo EXIF
// byte a byte, y el mismo tamaño de archivo resultante en los cuatro tipos.
import { describe, expect, it } from 'vitest'
import { armarExif, escribirExif, leerExif } from '../src/lib/webpExif.ts'
import { dimensiones } from '../src/lib/mime.ts'
import { bloquesDeImagen, imagen } from './fixtures/imageHelpers.js'

const casos = async () => ({
  // VP8 simple: con pérdida, sin transparencia.
  conPerdida: imagen('lossy.webp'),
  // VP8L simple: sin pérdida.
  sinPerdida: imagen('lossless.webp'),
  // VP8X ya extendido, por la transparencia.
  transparente: imagen('alpha.webp'),
  animado: imagen('animated.webp'),
})

describe('webpExif', () => {
  it('escribe y lee el pack y el autor en los cuatro tipos, sin tocar la imagen', async () => {
    for (const [nombre, w] of Object.entries(await casos())) {
      const con = escribirExif(w, { pack: 'Mi pack ñ 😀', author: 'Yo' })
      const meta = leerExif(con)
      expect(meta?.['sticker-pack-name'], nombre).toBe('Mi pack ñ 😀')
      expect(meta?.['sticker-pack-publisher'], nombre).toBe('Yo')
      // Los mismos bloques de imagen, byte a byte: no se recodificó.
      expect(bloquesDeImagen(con), nombre).toEqual(bloquesDeImagen(w))
      // Y el lienzo sigue diciendo el mismo tamaño.
      expect(dimensiones(con), nombre).toEqual({ ancho: 37, alto: 21 })
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
