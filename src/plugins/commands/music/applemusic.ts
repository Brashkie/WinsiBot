import type { Command } from '../../../types/index.js'
import axios from 'axios'

interface ITunesTrack {
  trackName?:      string
  artistName?:     string
  collectionName?: string
  releaseDate?:    string
  trackTimeMillis?: number
  trackViewUrl?:   string
  artworkUrl100?:  string
  primaryGenreName?: string
}

interface ITunesResponse {
  resultCount: number
  results:     ITunesTrack[]
}

// artworkUrl100 viene en 100x100 — iTunes sirve cualquier tamaño reemplazando
// ese segmento en la misma URL, sin necesidad de otro endpoint.
function bigArtwork(url: string): string {
  return url.replace('100x100bb', '600x600bb')
}

const command: Command = {
  name:        'applemusic',
  aliases:     ['am', 'itunes'],
  description: 'Busca una canción en Apple Music',
  category:    'music',
  cooldown:    5,

  async execute({ sock, jid, msg, args, prefix }) {
    const query = args.join(' ').trim()
    if (!query) {
      await sock.sendMessage(jid, {
        text: `✗ Uso: ${prefix}applemusic <canción>`,
      }, { quoted: msg })
      return
    }

    const res = await axios.get<ITunesResponse>('https://itunes.apple.com/search', {
      params:  { term: query, entity: 'song', limit: 1 },
      timeout: 10_000,
    }).catch(() => null)

    const track = res?.data?.results?.[0]
    if (!track) {
      await sock.sendMessage(jid, {
        text: `✗ No se encontró *"${query}"* en Apple Music.`,
      }, { quoted: msg })
      return
    }

    const duration = Math.floor((track.trackTimeMillis ?? 0) / 1000)
    const min = Math.floor(duration / 60)
    const sec = String(duration % 60).padStart(2, '0')

    const caption = [
      `🍎 *${track.trackName ?? query}*`,
      ``,
      `👤 Artista  » ${track.artistName ?? 'Desconocido'}`,
      `💿 Álbum    » ${track.collectionName ?? 'N/D'}`,
      `📅 Lanzamiento » ${track.releaseDate?.slice(0, 10) ?? 'N/D'}`,
      `⏱️ Duración » ${min}:${sec}`,
      track.primaryGenreName ? `🎧 Género  » ${track.primaryGenreName}` : '',
      track.trackViewUrl ? `🔗 ${track.trackViewUrl}` : '',
    ].filter(Boolean).join('\n')

    const artwork = track.artworkUrl100 ? bigArtwork(track.artworkUrl100) : null

    if (artwork) {
      await sock.sendMessage(jid, { image: { url: artwork }, caption }, { quoted: msg })
    } else {
      await sock.sendMessage(jid, { text: caption }, { quoted: msg })
    }
  },
}

export default command
