import type { Command } from '../../../types/index.js'
import { downloadFile, cleanTemp } from '@lib/utils.js'
import { readFile } from 'fs/promises'
import axios from 'axios'

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

    // API publica sin key — alternativa simple. Con timeout: sin él, si la API
    // se colgaba, el comando quedaba esperando para siempre.
    const apiUrl = `https://api.instagramdl.site/api?url=${encodeURIComponent(url)}`
    const res = await axios.get(apiUrl, { timeout: 20_000 })
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
    // El temporal se borra aunque el envío falle: antes quedaba en disco.
    try {
      const buf = await readFile(tmpPath)
      if (isVideo) {
        await sock.sendMessage(jid, { video: buf, caption: '📸 Instagram' }, { quoted: msg })
      } else {
        await sock.sendMessage(jid, { image: buf, caption: '📸 Instagram' }, { quoted: msg })
      }
    } finally {
      await cleanTemp(tmpPath)
    }
  },
}

export default command