// wa-sticker-formatter —y sharp, que trae detrás— se carga al hacer el primer
// sticker, no al arrancar: 5,5 MB de RAM y 0,6 s de arranque medidos con
// `npm run mem:profile`, que pagaba todo bot aunque no hiciera stickers.
const stickerLib = () => import('wa-sticker-formatter')
import { getTempPath } from './utils.js'
import { writeFile } from 'fs/promises'
import { config } from '@config'
export { leerMeta } from './stickerMeta.js'

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


/**
 * Le cambia el pack y el autor a un sticker que ya es WebP, sin volver a
 * codificarlo: solo reescribe su bloque EXIF. Sirve igual para animados, no
 * pierde calidad y no pasa por sharp ni ffmpeg (#take).
 */
export async function cambiarMeta(webp: Buffer, meta: { pack: string; author: string }): Promise<Buffer> {
  const { Exif } = await stickerLib()
  return new Exif({ pack: meta.pack, author: meta.author }).add(webp)
}

/** Sticker a partir de una imagen o video en memoria, sin pasar por disco. */
export async function stickerDe(media: Buffer, opts: StickerOptions = {}): Promise<Buffer> {
  const { createSticker, StickerTypes } = await stickerLib()
  return createSticker(media, {
    pack: opts.pack ?? config.botName,
    author: opts.author ?? 'Hepein',
    type: opts.animated ? StickerTypes.FULL : StickerTypes.DEFAULT,
    quality: 50,
  })
}

/** Un sticker estático a partir de una imagen ya en memoria (PNG, JPEG…). */
export async function stickerDeImagen(imagen: Buffer, opts: StickerOptions = {}): Promise<Buffer> {
  const { createSticker, StickerTypes } = await stickerLib()
  return createSticker(imagen, {
    pack: opts.pack ?? config.botName,
    author: opts.author ?? 'Hepein',
    type: StickerTypes.DEFAULT,
    quality: 60,
  })
}

export async function makeStickerFromUrl(
  url: string,
  opts: StickerOptions = {}
): Promise<string> {
  const res = await fetch(url)
  const buf = Buffer.from(await res.arrayBuffer())
  const output = getTempPath('webp')

  const { createSticker, StickerTypes } = await stickerLib()
  const sticker = await createSticker(buf, {
    pack: opts.pack ?? config.botName,
    author: opts.author ?? 'Hepein',
    type: opts.animated ? StickerTypes.FULL : StickerTypes.DEFAULT,
    quality: 50,
  })

  await writeFile(output, sticker)
  return output
}