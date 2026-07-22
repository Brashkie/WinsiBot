import type { Command } from '../../../types/index.js'
import axios from 'axios'

interface DeezerTrack {
  title?:    string
  link?:     string
  duration?: number
  artist?: {
    name?: string
  }
  album?: {
    title?:    string
    cover_xl?: string
    cover_big?: string
  }
}

interface DeezerResponse {
  data: DeezerTrack[]
}

const command: Command = {
  name:        'deezer',
  aliases:     ['dz'],
  description: 'Busca una canción en Deezer',
  category:    'music',
  cooldown:    5,

  async execute({ sock, jid, msg, args, prefix }) {
    const query = args.join(' ').trim()
    if (!query) {
      await sock.sendMessage(jid, {
        text: `✗ Uso: ${prefix}deezer <canción>`,
      }, { quoted: msg })
      return
    }

    const res = await axios.get<DeezerResponse>('https://api.deezer.com/search', {
      params:  { q: query, limit: 1 },
      timeout: 10_000,
    }).catch(() => null)

    const track = res?.data?.data?.[0]
    if (!track) {
      await sock.sendMessage(jid, {
        text: `✗ No se encontró *"${query}"* en Deezer.`,
      }, { quoted: msg })
      return
    }

    const duration = track.duration ?? 0
    const min = Math.floor(duration / 60)
    const sec = String(duration % 60).padStart(2, '0')

    const caption = [
      `🎧 *${track.title ?? query}*`,
      ``,
      `👤 Artista » ${track.artist?.name ?? 'Desconocido'}`,
      `💿 Álbum   » ${track.album?.title ?? 'N/D'}`,
      `⏱️ Duración » ${min}:${sec}`,
      track.link ? `🔗 ${track.link}` : '',
    ].filter(Boolean).join('\n')

    const cover = track.album?.cover_xl ?? track.album?.cover_big

    if (cover) {
      await sock.sendMessage(jid, { image: { url: cover }, caption }, { quoted: msg })
    } else {
      await sock.sendMessage(jid, { text: caption }, { quoted: msg })
    }
  },
}

export default command
