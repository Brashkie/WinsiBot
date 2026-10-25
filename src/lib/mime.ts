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
