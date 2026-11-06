// La miniatura de una imagen que sale, antes de que Baileys la pida.
//
// Baileys arma la miniatura de cada foto que se manda (`jpegThumbnail`, 32 px
// de ancho en JPEG, la que WhatsApp muestra mientras baja la foto) con sharp o
// jimp. Sin ninguno de los dos —el bot no usa sharp desde la 9.4.0—, la foto
// sale igual pero sin miniatura ni tamaño. Por eso el embudo de salida
// (core/egress.ts) la hace antes con la Session API (render.rs), y Baileys,
// al verla puesta, no busca nada. De paso le pone el ancho y el alto de la
// original, que también ponía Baileys.
//
// Una imagen por URL (`image: { url }`) se baja acá, una sola vez, y sigue
// como Buffer: Baileys no la vuelve a bajar. Si algo falla, el mensaje sale
// como venía —sin miniatura—, nunca deja de salir.
//
// Los videos no pasan por acá: su miniatura la saca Baileys con ffmpeg.

import { readFile } from 'node:fs/promises'
import { convertirImagen } from './imageApi.js'
import { dimensiones } from './mime.js'

/** El ancho de la miniatura, el mismo que usa Baileys. */
const ANCHO = 32

async function bytesDe(imagen: unknown): Promise<Buffer | null> {
  if (Buffer.isBuffer(imagen)) return imagen
  const url = (imagen as { url?: unknown } | null)?.url
  const s = url instanceof URL ? url.href : typeof url === 'string' ? url : null
  if (!s) return null
  if (/^https?:\/\//i.test(s)) {
    const r = await fetch(s, { signal: AbortSignal.timeout(20_000) })
    if (!r.ok) throw new Error(`HTTP ${r.status} al bajar ${s}`)
    return Buffer.from(await r.arrayBuffer())
  }
  return readFile(s.startsWith('file://') ? new URL(s) : s)
}

/**
 * El mensaje con `jpegThumbnail` (y `width`/`height`) si es una imagen que no
 * la trae; si no, el mismo mensaje.
 */
export async function conMiniatura<T>(content: T): Promise<T> {
  const c = content as Record<string, any> | null
  if (!c || c.image === undefined || c.jpegThumbnail !== undefined) return content
  let bytes: Buffer | null = null
  try {
    bytes = await bytesDe(c.image)
    if (!bytes) return content
    const miniatura = await convertirImagen(bytes, 'jpeg', 50, { ancho: ANCHO, alto: 4096 })
    const dim = c.width ? null : dimensiones(bytes)
    return {
      ...c,
      image: bytes,
      jpegThumbnail: miniatura.toString('base64'),
      ...(dim && { width: dim.ancho, height: dim.alto }),
    } as T
  } catch {
    // Bajada o miniatura fallidas: sale como venía (o ya bajada), sin miniatura.
    return (bytes ? { ...c, image: bytes } : content) as T
  }
}
