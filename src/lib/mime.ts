// El tipo de un archivo por sus primeros bytes, para los que manda el bot.
//
// Reemplaza a `file-type`, que se usaba en un solo lugar (interactive.ts) para
// saber si un Buffer era imagen, video o audio. Lo que ahí importa son esos
// pocos formatos; los demás salen como application/octet-stream, igual que
// lo que file-type no reconocía. Lógica pura: se prueba desde scripts/mime.test.js.

const empieza = (b: Uint8Array, firma: number[], desde = 0) =>
  b.length >= desde + firma.length && firma.every((x, i) => b[desde + i] === x)

const ascii = (b: Uint8Array, desde: number, largo: number) =>
  String.fromCharCode(...b.subarray(desde, desde + largo))

export function mimeDe(b: Uint8Array): string {
  if (empieza(b, [0xff, 0xd8, 0xff])) return 'image/jpeg'
  if (empieza(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png'
  if (ascii(b, 0, 4) === 'GIF8') return 'image/gif'
  if (ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 4) === 'WEBP') return 'image/webp'
  if (ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 4) === 'WAVE') return 'audio/wav'
  if (ascii(b, 4, 4) === 'ftyp') {
    // MP4 y familia: la "marca" dice cuál. M4A es audio; el resto, video.
    const marca = ascii(b, 8, 4)
    if (marca === 'M4A ' || marca === 'M4B ') return 'audio/mp4'
    if (marca.startsWith('qt')) return 'video/quicktime'
    if (marca === 'heic' || marca === 'heix' || marca === 'mif1') return 'image/heic'
    return 'video/mp4'
  }
  if (empieza(b, [0x1a, 0x45, 0xdf, 0xa3])) {
    // EBML: WebM si el DocType lo dice en los primeros bytes; si no, Matroska.
    return ascii(b, 0, Math.min(b.length, 64)).includes('webm') ? 'video/webm' : 'video/x-matroska'
  }
  if (ascii(b, 0, 4) === 'OggS') return 'audio/ogg'
  if (ascii(b, 0, 3) === 'ID3' || (b.length > 1 && b[0] === 0xff && (b[1]! & 0xe0) === 0xe0)) return 'audio/mpeg'
  if (ascii(b, 0, 4) === 'fLaC') return 'audio/flac'
  if (ascii(b, 0, 5) === '%PDF-') return 'application/pdf'
  return 'application/octet-stream'
}

/** Un WebP animado lo dice en la cabecera extendida (VP8X), en el bit 1 de
 *  sus banderas, siempre en el byte 20. Uno simple (VP8/VP8L) no es animado. */
export const esAnimado = (webp: Uint8Array) =>
  webp.length > 20 && ascii(webp, 12, 4) === 'VP8X' && (webp[20]! & 0x02) !== 0

/**
 * El ancho y el alto de un PNG, JPEG o WebP, leídos de su cabecera (sin
 * decodificarlo). null si no es uno de esos o está cortado.
 */
export function dimensiones(b: Uint8Array): { ancho: number; alto: number } | null {
  const u16be = (i: number) => (b[i]! << 8) | b[i + 1]!
  const u24le = (i: number) => b[i]! | (b[i + 1]! << 8) | (b[i + 2]! << 16)
  const tipo = mimeDe(b)
  if (tipo === 'image/png') {
    if (b.length < 24) return null
    const v = new DataView(b.buffer, b.byteOffset, b.byteLength)
    return { ancho: v.getUint32(16), alto: v.getUint32(20) }
  }
  if (tipo === 'image/jpeg') {
    // Los segmentos, hasta un SOF (0xC0-0xCF salvo DHT C4, JPG C8 y DAC CC).
    let i = 2
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) return null
      const m = b[i + 1]!
      if (m === 0xff) { i++; continue }
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
        return { ancho: u16be(i + 7), alto: u16be(i + 5) }
      }
      i += 2 + u16be(i + 2)
    }
    return null
  }
  if (tipo === 'image/webp' && b.length >= 30) {
    const bloque = ascii(b, 12, 4)
    if (bloque === 'VP8X') return { ancho: u24le(24) + 1, alto: u24le(27) + 1 }
    // Con pérdida: después de la etiqueta del cuadro y el código 9d 01 2a.
    if (bloque === 'VP8 ') return { ancho: (b[26]! | (b[27]! << 8)) & 0x3fff, alto: (b[28]! | (b[29]! << 8)) & 0x3fff }
    if (bloque === 'VP8L') {
      const bits = b[21]! | (b[22]! << 8) | (b[23]! << 16) | (b[24]! << 24)
      return { ancho: (bits & 0x3fff) + 1, alto: ((bits >>> 14) & 0x3fff) + 1 }
    }
  }
  return null
}
