// Stickers: una imagen o un video a WebP, con el pack y el autor adentro.
//
// Hasta la 9.0.0 lo hacía `wa-sticker-formatter`, que por dentro usaba sharp
// y ffmpeg —que el bot ya tiene— más nueve librerías propias (13 MB). Ahora
// es este archivo y `webpExif.ts`:
//
// - imagen → sharp → WebP, como antes;
// - video → WebP animado en UNA pasada de ffmpeg. La librería pasaba el video
//   entero a GIF —sin tope de largo ni de cuadros, el formato más pesado que
//   hay— y recién después a WebP con sharp;
// - el pack y el autor, en el bloque EXIF, sin recodificar (`#take`).
//
// sharp se carga al hacer el primer sticker, no al arrancar.

import { readFile, unlink, writeFile } from 'fs/promises'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { join } from 'path'
import { randomUUID } from 'crypto'
import { config } from '@config'
import { ffmpegPath } from './ffmpeg.js'
import { esAnimado, mimeDe } from './mime.js'
import { carpetaTmp, getTempPath } from './utils.js'
import { escribirExif } from './webpExif.js'
export { leerMeta } from './stickerMeta.js'

const run = promisify(execFile)
const sharpDe = () => import('sharp').then((m) => m.default)

export interface StickerOptions {
  pack?: string
  author?: string
  animated?: boolean
}

/** Lo que dice el sticker en "pack" y "autor" si nadie pide otra cosa. */
export const META_POR_DEFECTO = () => ({ pack: config.botName, author: 'Hepein' })

/** El pack y el autor de alguien: los suyos (#setmeta) o los del bot. */
export function metaDe(u: { stickerMeta?: { pack: string; author: string } } | undefined): { pack: string; author: string } {
  return u?.stickerMeta ?? META_POR_DEFECTO()
}

/** El lado de un sticker: WhatsApp los muestra en 512×512. */
const LADO = 512
/** Tope de un sticker animado: más largo o más fluido solo pesa más. */
const SEGUNDOS_MAX = 10
const FPS_MAX = 15
const TRANSPARENTE = { r: 0, g: 0, b: 0, alpha: 0 }

/**
 * Le cambia el pack y el autor a un sticker que ya es WebP, sin volver a
 * codificarlo: solo reescribe su bloque EXIF. Sirve igual para animados, no
 * pierde calidad y no pasa por sharp ni ffmpeg (#take).
 */
export async function cambiarMeta(webp: Buffer, meta: { pack: string; author: string }): Promise<Buffer> {
  return escribirExif(webp, meta)
}

/**
 * Un video a WebP animado, en una pasada: hasta 10 s, hasta 15 cuadros por
 * segundo, adentro de 512×512 con el resto transparente.
 */
async function videoAWebp(video: Buffer, calidad: number): Promise<Buffer> {
  const dir = await carpetaTmp()
  const id = randomUUID()
  const entrada = join(dir, `${id}.in`)
  const salida = join(dir, `${id}.webp`)
  try {
    await writeFile(entrada, video)
    await run(ffmpegPath(), [
      '-y', '-i', entrada, '-t', String(SEGUNDOS_MAX),
      '-vf', `fps=${FPS_MAX},scale=${LADO}:${LADO}:force_original_aspect_ratio=decrease:flags=lanczos,format=rgba,` +
             `pad=${LADO}:${LADO}:(ow-iw)/2:(oh-ih)/2:color=black@0`,
      '-c:v', 'libwebp_anim', '-lossless', '0', '-q:v', String(calidad), '-compression_level', '4',
      '-loop', '0', '-an', salida,
    ], { timeout: 60_000, windowsHide: true })
    return await readFile(salida)
  } finally {
    await unlink(entrada).catch(() => {})
    await unlink(salida).catch(() => {})
  }
}

/**
 * La imagen o el video, a WebP de sticker.
 *
 * `completo`: el sticker ocupa 512×512 con lo que sobra transparente, que es
 * como se ven los animados. Sin eso, la imagen queda con su proporción y como
 * mucho 512 de lado: antes salía del tamaño original, y una foto de 4000 px
 * daba un sticker de varios MB que WhatsApp igual muestra en 512.
 */
async function aWebp(media: Buffer, calidad: number, completo: boolean): Promise<Buffer> {
  const mime = mimeDe(media)
  if (mime.startsWith('video/')) return videoAWebp(media, calidad)
  const sharp = await sharpDe()
  const animado = mime === 'image/gif' || (mime === 'image/webp' && esAnimado(media))
  const img = sharp(media, { animated: animado })
  if (completo) img.resize(LADO, LADO, { fit: 'contain', background: TRANSPARENTE })
  else img.resize(LADO, LADO, { fit: 'inside', withoutEnlargement: true })
  return img.webp({ quality: calidad, lossless: false }).toBuffer()
}

/** Sticker a partir de una imagen o video en memoria. */
export async function stickerDe(media: Buffer, opts: StickerOptions = {}): Promise<Buffer> {
  const webp = await aWebp(media, 50, !!opts.animated)
  return escribirExif(webp, { pack: opts.pack ?? config.botName, author: opts.author ?? 'Hepein' })
}

/** Un sticker estático a partir de una imagen ya en memoria (PNG, JPEG…). */
export async function stickerDeImagen(imagen: Buffer, opts: StickerOptions & { calidad?: number } = {}): Promise<Buffer> {
  const webp = await aWebp(imagen, opts.calidad ?? 60, false)
  return escribirExif(webp, { pack: opts.pack ?? config.botName, author: opts.author ?? 'Hepein' })
}

export async function makeStickerFromUrl(url: string, opts: StickerOptions = {}): Promise<string> {
  const res = await fetch(url)
  const output = getTempPath('webp')
  await writeFile(output, await stickerDe(Buffer.from(await res.arrayBuffer()), opts))
  return output
}
