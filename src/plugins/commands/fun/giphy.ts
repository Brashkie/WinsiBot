import type { Command } from '../../../types/index.js'
import { safeSend } from '@lib/media_sender.js'
import axios from 'axios'

const GIPHY_KEY = 'NoXp0QCKaRe5Km23RzJ1JGfwJrC3qwe5'

const command: Command = {
  name:        'giphy',
  aliases:     ['gif'],
  description: 'Busca un GIF en GIPHY',
  category:    'fun',
  cooldown:    5,

  async execute({ sock, jid, msg, args }) {
    const query = args.join(' ').trim()

    if (!query) {
      await safeSend(() => sock.sendMessage(jid, {
        text: '§ Escribe qué buscar\nEjemplo: !giphy gato',
      }, { quoted: msg }))
      return
    }

    const res = await axios.get('https://api.giphy.com/v1/gifs/search', {
      params: { api_key: GIPHY_KEY, q: query, limit: 10, rating: 'pg-13', lang: 'es' },
      timeout: 8_000,
    }).catch(() => null)

    const data = res?.data?.data
    if (!Array.isArray(data) || data.length === 0) {
      await safeSend(() => sock.sendMessage(jid, {
        text: `§ No encontré GIFs de *${query}*`,
      }, { quoted: msg }))
      return
    }

    const gif    = data[Math.floor(Math.random() * data.length)]
    const asGif  = Math.random() < 0.5

    if (asGif) {
      const mp4 = gif.images?.original?.mp4
      if (!mp4) return
      await safeSend(() => sock.sendMessage(jid, {
        video:       { url: mp4 },
        gifPlayback: true,
        caption:     `_${query}_`,
      }, { quoted: msg }))
    } else {
      const webp = gif.images?.original?.webp
      if (!webp) return
      await safeSend(() => sock.sendMessage(jid, {
        sticker: { url: webp },
      }, { quoted: msg }))
    }
  },
}

export default command
