// Lo que los tests usaban de sharp, sin sharp (9.4.0): las imágenes de prueba
// están en fixtures/images/ —hechas una vez con sharp antes de sacarlo—, y lo
// que hay que leer de una imagen se lee acá.
import { readFileSync } from 'node:fs'
import { inflateSync } from 'node:zlib'

/** Una imagen de fixtures/images/. */
export const imagen = (nombre) => readFileSync(new URL(`./images/${nombre}`, import.meta.url))

/**
 * Los bloques de un WebP que son la imagen: todo menos EXIF, XMP y la
 * cabecera VP8X, que cambia al agregar un EXIF —un WebP simple pasa a
 * extendido— (el tamaño se compara con `dimensiones`). Si dos WebP dan lo
 * mismo, la imagen no se recodificó: es más estricto que comparar píxeles.
 */
export function bloquesDeImagen(webp) {
  const bloques = []
  for (let i = 12; i + 8 <= webp.length;) {
    const tipo = webp.toString('latin1', i, i + 4)
    const largo = webp.readUInt32LE(i + 4)
    const datos = webp.subarray(i + 8, i + 8 + largo)
    if (tipo !== 'VP8X' && tipo !== 'EXIF' && tipo !== 'XMP ') bloques.push(`${tipo} ${datos.toString('hex')}`)
    i += 8 + largo + (largo & 1)
  }
  return bloques
}

/**
 * Un PNG de grises de 8 bits, sin entrelazar y con filtro 0 en cada fila —lo
 * que escribe qr.ts—, a { ancho, alto, px }.
 */
export function leerPngGris(png) {
  const ancho = png.readUInt32BE(16)
  const alto = png.readUInt32BE(20)
  if (png[24] !== 8 || png[25] !== 0) throw new Error('no es un PNG de grises de 8 bits')
  const idat = []
  for (let i = 8; i + 8 <= png.length;) {
    const largo = png.readUInt32BE(i)
    if (png.toString('latin1', i + 4, i + 8) === 'IDAT') idat.push(png.subarray(i + 8, i + 8 + largo))
    i += 12 + largo
  }
  const filas = inflateSync(Buffer.concat(idat))
  const px = Buffer.alloc(ancho * alto)
  for (let y = 0; y < alto; y++) {
    if (filas[y * (ancho + 1)] !== 0) throw new Error('filtro distinto de 0')
    filas.copy(px, y * ancho, y * (ancho + 1) + 1, (y + 1) * (ancho + 1))
  }
  return { ancho, alto, px }
}
