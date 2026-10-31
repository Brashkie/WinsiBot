// El pack y el autor de un sticker: un bloque EXIF dentro del WebP.
//
// Reemplaza a la parte de `wa-sticker-formatter` que lo hacía con
// `node-webpmux`. El formato es simple —un RIFF con una lista de bloques
// `fourcc + largo + datos`—, y escribirlo acá es lo que permitió sacar esa
// librería y las nueve que arrastraba.
//
// Lo que WhatsApp lee es el JSON de adentro del EXIF: `sticker-pack-id`,
// `sticker-pack-name`, `sticker-pack-publisher` y `emojis`, detrás de una
// cabecera TIFF fija de 22 bytes. Es byte a byte la misma que armaba la
// librería; scripts/webpExif.test.js lo comprueba.
//
// Lógica pura: sin sharp ni ffmpeg, no recodifica la imagen. Un sticker
// animado conserva todos sus cuadros tal cual.

import { randomBytes } from 'crypto'

export interface MetaSticker {
  pack: string
  author: string
  /** Emojis de la categoría, para el buscador de WhatsApp. */
  emojis?: string[]
}

/** La cabecera TIFF del EXIF: little-endian, un campo, y el JSON a partir del byte 22. */
const TIFF = [0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x41, 0x57, 0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x16, 0x00, 0x00, 0x00]

/** El EXIF de un sticker. El largo del JSON va en el byte 14. */
export function armarExif(meta: MetaSticker, id = randomBytes(32).toString('hex')): Buffer {
  const json = Buffer.from(JSON.stringify({
    'sticker-pack-id': id,
    'sticker-pack-name': meta.pack,
    'sticker-pack-publisher': meta.author,
    emojis: meta.emojis ?? [],
  }), 'utf-8')
  const exif = Buffer.concat([Buffer.from(TIFF), json])
  exif.writeUInt32LE(json.length, 14)
  return exif
}

interface Bloque {
  tipo: string
  datos: Buffer
}

function leerBloques(webp: Buffer): Bloque[] {
  if (webp.length < 12 || webp.toString('latin1', 0, 4) !== 'RIFF' || webp.toString('latin1', 8, 12) !== 'WEBP') {
    throw new Error('no es un WebP')
  }
  const bloques: Bloque[] = []
  let i = 12
  while (i + 8 <= webp.length) {
    const tipo = webp.toString('latin1', i, i + 4)
    const largo = webp.readUInt32LE(i + 4)
    if (i + 8 + largo > webp.length) throw new Error(`WebP cortado en el bloque ${tipo}`)
    bloques.push({ tipo, datos: webp.subarray(i + 8, i + 8 + largo) })
    // Los bloques de largo impar llevan un byte de relleno.
    i += 8 + largo + (largo & 1)
  }
  return bloques
}

function armarWebp(bloques: Bloque[]): Buffer {
  const partes: Buffer[] = []
  for (const b of bloques) {
    const cab = Buffer.alloc(8)
    cab.write(b.tipo, 0, 'latin1')
    cab.writeUInt32LE(b.datos.length, 4)
    partes.push(cab, b.datos)
    if (b.datos.length & 1) partes.push(Buffer.alloc(1))
  }
  const cuerpo = Buffer.concat(partes)
  const riff = Buffer.alloc(12)
  riff.write('RIFF', 0, 'latin1')
  riff.writeUInt32LE(cuerpo.length + 4, 4)
  riff.write('WEBP', 8, 'latin1')
  return Buffer.concat([riff, cuerpo])
}

/** Ancho, alto y si tiene alfa, de un WebP simple (VP8 o VP8L). */
function dimensiones(b: Bloque): { ancho: number; alto: number; alfa: boolean } {
  const d = b.datos
  if (b.tipo === 'VP8 ') {
    // Cuadro clave: 3 bytes de etiqueta, el código 9d 01 2a, y después ancho y
    // alto de 14 bits cada uno.
    if (d.length < 10 || d[3] !== 0x9d || d[4] !== 0x01 || d[5] !== 0x2a) throw new Error('VP8 sin cuadro clave')
    return { ancho: d.readUInt16LE(6) & 0x3fff, alto: d.readUInt16LE(8) & 0x3fff, alfa: false }
  }
  if (b.tipo === 'VP8L') {
    // Firma 0x2f y 32 bits: ancho-1 (14), alto-1 (14), alfa (1), versión (3).
    if (d.length < 5 || d[0] !== 0x2f) throw new Error('VP8L sin firma')
    const bits = d.readUInt32LE(1)
    return { ancho: (bits & 0x3fff) + 1, alto: ((bits >>> 14) & 0x3fff) + 1, alfa: ((bits >>> 28) & 1) === 1 }
  }
  throw new Error(`no sé leer las dimensiones de un bloque ${b.tipo}`)
}

/**
 * Le pone (o le cambia) el pack y el autor a un WebP sin recodificarlo.
 *
 * Para llevar EXIF, el WebP tiene que ser "extendido" (bloque VP8X, con la
 * bandera de EXIF). Si ya lo es —los que tienen transparencia o animación—,
 * se prende la bandera y se reemplaza el EXIF que tuviera. Si es simple, se
 * le antepone un VP8X con el ancho y el alto de su imagen.
 */
export function escribirExif(webp: Buffer, meta: MetaSticker): Buffer {
  const bloques = leerBloques(webp).filter((b) => b.tipo !== 'EXIF')
  const exif: Bloque = { tipo: 'EXIF', datos: armarExif(meta) }
  const primero = bloques[0]
  if (!primero) throw new Error('WebP sin imagen')

  if (primero.tipo === 'VP8X') {
    const vp8x = Buffer.from(primero.datos)
    vp8x[0] = vp8x[0]! | 0x08
    return armarWebp([{ tipo: 'VP8X', datos: vp8x }, ...bloques.slice(1), exif])
  }

  const { ancho, alto, alfa } = dimensiones(primero)
  const vp8x = Buffer.alloc(10)
  vp8x[0] = 0x08 | (alfa ? 0x10 : 0)
  vp8x.writeUIntLE(ancho - 1, 4, 3)
  vp8x.writeUIntLE(alto - 1, 7, 3)
  return armarWebp([{ tipo: 'VP8X', datos: vp8x }, ...bloques, exif])
}

/** El JSON del EXIF de un sticker, o null si no tiene. */
export function leerExif(webp: Buffer): Record<string, unknown> | null {
  const exif = leerBloques(webp).find((b) => b.tipo === 'EXIF')?.datos
  if (!exif || exif.length < 22) return null
  const largo = exif.readUInt32LE(14)
  try {
    return JSON.parse(exif.toString('utf-8', 22, 22 + largo)) as Record<string, unknown>
  } catch {
    return null
  }
}
