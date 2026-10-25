import type { Command } from '../../../types/index.js'
import { config } from '@config'
import { buscarPista } from '@lib/spotify.js'

const command: Command = {
  name: 'spotify',
  aliases: ['sp', 'spoti'],
  description: 'Busca info de una canción en Spotify',
  category: 'music',

  async execute({ sock, jid, msg, args }) {
    if (!config.spotifyClientId || !config.spotifyClientSecret) {
      await sock.sendMessage(jid, { text: '❌ Spotify no configurado.' }, { quoted: msg })
      return
    }

    const query = args.join(' ')
    if (!query) {
      await sock.sendMessage(jid, { text: '❌ Uso: !spotify <canción>' }, { quoted: msg })
      return
    }

    const track = await buscarPista(query)

    if (!track) {
      await sock.sendMessage(jid, { text: '❌ No se encontró la canción.' }, { quoted: msg })
      return
    }

    const artists = track.artists.map(a => a.name).join(', ')
    const duration = Math.floor(track.duration_ms / 1000)
    const min = Math.floor(duration / 60)
    const sec = String(duration % 60).padStart(2, '0')

    const text = `🎵 *${track.name}*
👤 Artistas: ${artists}
💿 Álbum: ${track.album.name}
📅 Lanzamiento: ${track.album.release_date}
⏱️ Duración: ${min}:${sec}
🔗 ${track.external_urls.spotify}`

    const coverUrl = track.album.images[0]?.url

    if (coverUrl) {
      const res = await fetch(coverUrl)
      const buf = Buffer.from(await res.arrayBuffer())
      await sock.sendMessage(jid, {
        image: buf,
        caption: text,
      }, { quoted: msg })
    } else {
      await sock.sendMessage(jid, { text }, { quoted: msg })
    }
  },
}

export default command