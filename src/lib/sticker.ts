// wa-sticker-formatter —y sharp, que trae detrás— se carga al hacer el primer
// sticker, no al arrancar: 5,5 MB de RAM y 0,6 s de arranque medidos con
// `npm run mem:profile`, que pagaba todo bot aunque no hiciera stickers.
const stickerLib = () => import('wa-sticker-formatter')
import { readFile } from 'fs/promises'
import { getTempPath } from './utils.js'
import { writeFile } from 'fs/promises'
import { config } from '@config'

interface StickerOptions {
  pack?: string
  author?: string
  animated?: boolean
}

export async function makeSticker(
  inputPath: string,
  opts: StickerOptions = {}
): Promise<string> {
  const output = getTempPath('webp')

  const { createSticker, StickerTypes } = await stickerLib()
  const sticker = await createSticker(
    await readFile(inputPath),
    {
      pack: opts.pack ?? config.botName,
      author: opts.author ?? 'Hepein',
      type: opts.animated ? StickerTypes.FULL : StickerTypes.DEFAULT,
      quality: 50,
    }
  )

  await writeFile(output, sticker)
  return output
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