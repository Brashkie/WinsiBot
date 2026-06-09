import type { Command } from '../../../types/index.js'
import { createSticker, StickerTypes } from 'wa-sticker-formatter'
import axios from 'axios'

interface StickerPackResponse {
  result?: string[]
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

const command: Command = {
  name:        'stickerpack',
  aliases:     ['packsticker', 'spack'],
  description: 'Descarga un paquete de stickers desde getstickerpack.com',
  category:    'sticker',
  cooldown:    30,

  async execute({ sock, jid, msg, args, prefix }) {
    const url = args[0]?.trim()

    if (!url || !url.includes('getstickerpack.com')) {
      await sock.sendMessage(jid, {
        text: [
          `◈ Uso: ${prefix}stickerpack <url>`,
          `§ Ejemplo: ${prefix}stickerpack https://getstickerpack.com/stickers/flork-memes-4-1`,
        ].join('\n'),
      }, { quoted: msg })
      return
    }

    const sent = await sock.sendMessage(jid, {
      text: '◈ Obteniendo paquete de stickers...',
    }, { quoted: msg })
    const key = sent?.key

    let stickers: string[] = []
    try {
      const res = await axios.get<StickerPackResponse>(
        `https://api.akuari.my.id/downloader/stickerpack?link=${encodeURIComponent(url)}`,
        { timeout: 20_000 },
      )
      stickers = res.data.result ?? (Array.isArray(res.data) ? res.data as string[] : [])
    } catch {
      await sock.sendMessage(jid, {
        text: '✗ No se pudo obtener el paquete. Verifica la URL.',
        edit: key,
      } as any)
      return
    }

    if (!stickers.length) {
      await sock.sendMessage(jid, {
        text: '✗ El paquete está vacío o la URL no es válida.',
        edit: key,
      } as any)
      return
    }

    const total = Math.min(stickers.length, 30)
    await sock.sendMessage(jid, {
      text: `◈ Enviando ${total} stickers...`,
      edit: key,
    } as any)

    let sent2 = 0
    for (const stickerUrl of stickers.slice(0, total)) {
      try {
        const imgRes = await axios.get<ArrayBuffer>(stickerUrl, {
          responseType: 'arraybuffer',
          timeout:      15_000,
        })
        const buf = Buffer.from(imgRes.data)

        const webp = await createSticker(buf, {
          pack:    'WinsiBot',
          author:  'Hepein',
          type:    StickerTypes.DEFAULT,
          quality: 50,
        })

        await sock.sendMessage(jid, { sticker: webp }, { quoted: msg })
        sent2++
        await sleep(1_500)
      } catch {
        // skip sticker on error
      }
    }

    if (sent2 === 0) {
      await sock.sendMessage(jid, {
        text: '✗ No se pudo convertir ningún sticker del paquete.',
      }, { quoted: msg })
    }
  },
}

export default command
