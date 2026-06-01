import type { Command } from '../../../types/index.js'
import { downloadTikTok, downloadBuffer } from '@lib/downloader.js'
import axios from 'axios'

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

interface TikTokData {
  title?:  string
  author?: { name?: string }
  video?:  { noWatermark?: string; watermark?: string }
  music?:  { title?: string; author?: string }
  stats?:  { plays?: number; likes?: number; comments?: number }
}

async function getTikTokInfo(url: string): Promise<TikTokData | null> {
  try {
    const res = await axios.get(
      `https://api.tiklydown.eu.org/api/download/v2?url=${encodeURIComponent(url)}`,
      { timeout: 15_000 }
    )
    return res.data
  } catch {
    return null
  }
}

const command: Command = {
  name: 'tiktok',
  aliases: ['tt', 'tik'],
  description: 'Descarga video de TikTok sin marca de agua',
  category: 'downloader',
  cooldown: 10,

  async execute({ sock, jid, msg, args }) {
    const url = args[0]?.trim()

    if (!url || !url.startsWith('http')) {
      await sock.sendMessage(jid, {
        text: 'Uso: #tiktok <url>',
      }, { quoted: msg })
      return
    }

    // animacion
    const sent = await sock.sendMessage(jid, {
      text: '◈ Obteniendo TikTok...',
    }, { quoted: msg })
    const key = sent?.key

    const frames = [
      '◈◈ Analizando url...',
      '◈◈◈ Descargando video...',
      '◈◈ Sin marca de agua...',
    ]

    // obtener info y animar en paralelo
    const [data] = await Promise.all([
      getTikTokInfo(url),
      (async () => {
        for (const frame of frames) {
          await sleep(500)
          await sock.sendMessage(jid, { text: frame, edit: key } as any)
        }
      })(),
    ])

    // intentar con API primero
    const videoUrl = data?.video?.noWatermark ?? data?.video?.watermark

    let buffer: Buffer | null = null

    if (videoUrl) {
      try {
        buffer = await downloadBuffer(videoUrl)
      } catch {
        buffer = null
      }
    }

    // fallback — usar yt-dlp si la API falla
    if (!buffer) {
      try {
        await sock.sendMessage(jid, {
          text: '◈ Usando metodo alternativo...',
          edit: key,
        } as any)
        const result = await downloadTikTok(url)
        buffer = result.buffer
      } catch {
        await sock.sendMessage(jid, {
          text: '✗ No se pudo descargar el video.',
          edit: key,
        } as any)
        return
      }
    }

    await sock.sendMessage(jid, { text: '✔ Listo', edit: key } as any)
    await sleep(200)

    // construir caption
    const title   = data?.title?.slice(0, 80)  ?? ''
    const author  = data?.author?.name          ?? ''
    const music   = data?.music?.title          ?? ''
    const plays   = data?.stats?.plays          ?? 0
    const likes   = data?.stats?.likes          ?? 0

    const lines: string[] = []
    if (title)  lines.push(`◆ ${title}`)
    if (author) lines.push(`§ ${author}`)
    if (music)  lines.push(`♪ ${music}`)
    if (plays)  lines.push(`▸ ${plays.toLocaleString()} reproducciones`)
    if (likes)  lines.push(`✦ ${likes.toLocaleString()} likes`)

    const caption = lines.join('\n') || '◆ TikTok'

    await sock.sendMessage(jid, {
      video:   buffer,
      caption,
    }, { quoted: msg })
  },
}

export default command