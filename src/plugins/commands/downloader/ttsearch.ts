import type { Command } from '../../../types/index.js'
import { sendCarousel, type CarouselCard } from '@lib/interactive.js'
import { config } from '@config'
import axios from 'axios'

interface TikWMStats {
  play_count?:    number
  digg_count?:    number
  comment_count?: number
  share_count?:   number
}

interface TikWMVideo {
  video_id?:   string
  aweme_id?:   string
  title?:      string
  desc?:       string
  cover?:      string
  author?: {
    unique_id?: string
    nickname?:  string
  }
  stats?:      TikWMStats
  statistics?: TikWMStats
  create_time?: number
}

interface TikWMResponse {
  code:  number
  data?: { videos?: TikWMVideo[] }
}

async function searchTikWM(query: string, count = 8): Promise<TikWMVideo[]> {
  try {
    const res = await axios.get<TikWMResponse>(
      `https://www.tikwm.com/api/feed/search?keywords=${encodeURIComponent(query)}&count=${count}&cursor=0`,
      { timeout: 12_000, headers: { 'User-Agent': 'Mozilla/5.0' } },
    )
    return res.data.code === 0 ? (res.data.data?.videos ?? []) : []
  } catch {
    return []
  }
}

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

const command: Command = {
  name:        'ttsearch',
  aliases:     ['vitiktok', 'tiktoksearch', 'ttsb'],
  description: 'Busca videos en TikTok y muestra carrusel para descargar',
  category:    'downloader',
  cooldown:    10,

  async execute({ sock, jid, msg, args, prefix }) {
    const query = args.join(' ').trim()
    if (!query) {
      await sock.sendMessage(jid, {
        text: `◈ Uso: ${prefix}ttsearch <búsqueda>\n§ Ejemplo: ${prefix}ttsearch baile viral`,
      }, { quoted: msg })
      return
    }

    await sock.sendMessage(jid, {
      text: `◈ Buscando TikToks sobre "${query}"...`,
    }, { quoted: msg })

    const videos = await searchTikWM(query)
    if (!videos.length) {
      await sock.sendMessage(jid, {
        text: `✗ No se encontraron videos para "${query}".\n§ Intenta con otro término.`,
      }, { quoted: msg })
      return
    }

    // El botón usa el mismo prefix con el que el usuario llamó el comando,
    // así que !tiktok <url> se procesa automáticamente en el handler
    const cmd = `${config.prefix[0] ?? prefix}tiktok`
    const total = Math.min(videos.length, 8)

    const cards: CarouselCard[] = videos.slice(0, total).map((v, i) => {
      const title    = (v.title ?? v.desc ?? `Video #${i + 1}`).slice(0, 80)
      const username = v.author?.unique_id ?? v.author?.nickname ?? 'unknown'
      const nickname = v.author?.nickname  ?? username
      const videoId  = v.video_id ?? v.aweme_id ?? ''
      const st       = v.stats ?? v.statistics ?? {}
      const plays    = st.play_count    ?? 0
      const likes    = st.digg_count    ?? 0
      const comments = st.comment_count ?? 0
      const cover    = v.cover ?? ''
      const dlUrl    = `https://www.tiktok.com/@${username}/video/${videoId}`

      const text = [
        `🎵 *${title}${title.length === 80 ? '…' : ''}*`,
        '',
        `👤 ${nickname}  (@${username})`,
        `▸ ${fmt(plays)} vistas  ✦ ${fmt(likes)} likes  💬 ${fmt(comments)}`,
        ``,
        `◆ ${i + 1} / ${total}`,
      ].join('\n')

      const card: CarouselCard = {
        text,
        footer:  '🎵 TikTok Search',
        buttons: [
          ['📥 Descargar', `${cmd} ${dlUrl}`],
          ['🔍 Buscar más', `${config.prefix[0] ?? prefix}ttsearch ${query}`],
        ],
      }
      if (cover) card.media = cover
      return card
    })

    await sendCarousel(
      sock, jid,
      `🎵 TikTok: "${query}"`,
      '🎵 Desliza para ver más',
      cards,
      msg,
    )
  },
}

export default command
