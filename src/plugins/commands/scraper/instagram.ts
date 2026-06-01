import type { Command } from '../../../types/index.js'
import { downloadFile, cleanTemp } from '@lib/utils.js'
import { readFile } from 'fs/promises'
import axios from 'axios'

async function getInstagramMedia(url: string): Promise<string[]> {
  const res = await axios.post(
    'https://instagram-downloader-scraper.p.rapidapi.com/get-info-by-url',
    { url },
    {
      headers: {
        'Content-Type': 'application/json',
        'x-rapidapi-host': 'instagram-downloader-scraper.p.rapidapi.com',
      },
    }
  )
  return res.data?.urls ?? []
}

const command: Command = {
  name: 'ig',
  aliases: ['instagram', 'insta'],
  description: 'Descarga foto/video de Instagram',
  category: 'scraper',

  async execute({ sock, jid, msg, args }) {
    const url = args[0]
    if (!url) {
      await sock.sendMessage(jid, { text: '❌ Uso: !ig <url>' }, { quoted: msg })
      return
    }

    await sock.sendMessage(jid, { text: '⏳ Obteniendo contenido...' }, { quoted: msg })

    // API publica sin key — alternativa simple
    const apiUrl = `https://api.instagramdl.site/api?url=${encodeURIComponent(url)}`
    const res = await axios.get(apiUrl)
    const data = res.data

    const mediaUrl: string | undefined =
      data?.data?.url ??
      data?.url ??
      data?.media?.[0]?.url

    if (!mediaUrl) {
      await sock.sendMessage(jid, { text: '❌ No se pudo obtener el contenido.' }, { quoted: msg })
      return
    }

    const isVideo = mediaUrl.includes('.mp4') || mediaUrl.includes('video')
    const ext = isVideo ? 'mp4' : 'jpg'

    const tmpPath = await downloadFile(mediaUrl, ext)
    const buf = await readFile(tmpPath)

    if (isVideo) {
      await sock.sendMessage(jid, { video: buf, caption: '📸 Instagram' }, { quoted: msg })
    } else {
      await sock.sendMessage(jid, { image: buf, caption: '📸 Instagram' }, { quoted: msg })
    }

    await cleanTemp(tmpPath)
  },
}

export default command