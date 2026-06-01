import { StickerTypes, createSticker } from 'wa-sticker-formatter'
import { readFile } from 'fs/promises'
import { getTempPath } from './utils.js'
import { writeFile } from 'fs/promises'

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

  const sticker = await createSticker(
    await readFile(inputPath),
    {
      pack: opts.pack ?? 'WinsiBot',
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

  const sticker = await createSticker(buf, {
    pack: opts.pack ?? 'WinsiBot',
    author: opts.author ?? 'Hepein',
    type: opts.animated ? StickerTypes.FULL : StickerTypes.DEFAULT,
    quality: 50,
  })

  await writeFile(output, sticker)
  return output
}