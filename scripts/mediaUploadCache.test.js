// El caché de subidas (src/lib/mediaUploadCache.ts): con él, Baileys sube una
// sola vez el mismo archivo, y lo reusa en el envío siguiente.
import { describe, expect, it } from 'vitest'
import { prepareWAMessageMedia } from '@whiskeysockets/baileys'
import { mediaCacheDe, nuevoMediaCache, recordar } from '../src/lib/mediaUploadCache.ts'

const RUTA = new URL('./fixtures/images/size-1536x1024.png', import.meta.url)

function subidaFalsa() {
  const subidas = []
  const upload = async (_ruta, opts) => {
    subidas.push(opts.mediaType)
    return { mediaUrl: `https://mmg.whatsapp.net/falso/${subidas.length}`, directPath: `/falso/${subidas.length}` }
  }
  return { subidas, upload }
}

describe('caché de subidas', () => {
  it('el mismo archivo se sube una vez y la segunda se reusa', async () => {
    const { subidas, upload } = subidaFalsa()
    const mediaCache = nuevoMediaCache()
    const pedir = () => prepareWAMessageMedia(
      { image: { url: RUTA.pathname.replace(/^\/([A-Za-z]:)/, '$1') }, jpegThumbnail: 'eA==', caption: 'a' },
      { upload, mediaCache },
    )
    const a = await pedir()
    const b = await pedir()
    expect(subidas).toEqual(['image'])
    expect(b.imageMessage.url).toBe(a.imageMessage.url)
    expect(Buffer.from(b.imageMessage.mediaKey)).toEqual(Buffer.from(a.imageMessage.mediaKey))
  })

  it('sin caché, o con un Buffer, se sube cada vez', async () => {
    const { subidas, upload } = subidaFalsa()
    const ruta = RUTA.pathname.replace(/^\/([A-Za-z]:)/, '$1')
    await prepareWAMessageMedia({ image: { url: ruta }, jpegThumbnail: 'eA==' }, { upload })
    await prepareWAMessageMedia({ image: { url: ruta }, jpegThumbnail: 'eA==' }, { upload })
    const { readFileSync } = await import('node:fs')
    const mediaCache = nuevoMediaCache()
    const buf = readFileSync(RUTA)
    await prepareWAMessageMedia({ image: buf, jpegThumbnail: 'eA==' }, { upload, mediaCache })
    await prepareWAMessageMedia({ image: buf, jpegThumbnail: 'eA==' }, { upload, mediaCache })
    expect(subidas).toHaveLength(4)
  })

  it('cada socket tiene el suyo', () => {
    const a = {}, b = {}
    const ca = nuevoMediaCache(), cb = nuevoMediaCache()
    recordar(a, ca)
    recordar(b, cb)
    expect(mediaCacheDe(a)).toBe(ca)
    expect(mediaCacheDe(b)).toBe(cb)
    expect(mediaCacheDe({})).toBeUndefined()
    expect(mediaCacheDe(undefined)).toBeUndefined()
  })
})
