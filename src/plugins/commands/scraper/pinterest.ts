import type { Command } from '../../../types/index.js'
import { safeSend } from '@lib/media_sender.js'
import axios from 'axios'

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

// ─── Scrape Pinterest search HTML para extraer imágenes ───────────────────────
async function pinterestSearch(query: string, limit = 6): Promise<string[]> {
  const res = await axios.get<string>('https://www.pinterest.com/search/pins/', {
    params:  { q: query, rs: 'typed' },
    headers: {
      'User-Agent':      UA,
      'Accept':          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
    },
    timeout: 14_000,
  })

  const html = res.data

  // Pinterest incrusta URLs de sus CDN i.pinimg.com en el HTML
  // Preferir tamaño 736x (buena calidad, no demasiado pesado)
  const raw = [...html.matchAll(/https:\/\/i\.pinimg\.com\/[\w/.-]+\.(?:jpg|jpeg|png|webp)/gi)]
    .map(m => m[0])
    // normalizar a 736x para calidad consistente
    .map(u => u.replace(/\/\d+x\//, '/736x/'))
    // únicos
    .filter((u, i, arr) => arr.indexOf(u) === i)
    // filtrar miniaturas muy pequeñas (proxies, perfiles, etc.)
    .filter(u => !u.includes('/75x/') && !u.includes('/30x/'))

  return raw.slice(0, limit)
}

const command: Command = {
  name:        'pinterest',
  aliases:     ['pin', 'pint'],
  description: 'Busca imágenes en Pinterest',
  category:    'scraper',
  cooldown:    8,

  async execute({ sock, jid, msg, args }) {
    const query = args.join(' ').trim()

    if (!query) {
      await safeSend(() => sock.sendMessage(jid, {
        text: '§ Escribe qué buscar\nEjemplo: !pinterest paisajes',
      }, { quoted: msg }))
      return
    }

    await safeSend(() => sock.sendMessage(jid, {
      react: { text: '⏳', key: msg.key },
    }))

    const images = await pinterestSearch(query).catch(() => [] as string[])

    if (images.length === 0) {
      await safeSend(() => sock.sendMessage(jid, {
        text: `§ No encontré imágenes de *${query}* en Pinterest`,
      }, { quoted: msg }))
      return
    }

    // Primera imagen con caption, resto sin
    for (let i = 0; i < images.length; i++) {
      const content = i === 0
        ? { image: { url: images[i]! }, caption: `📌 *Pinterest* — _${query}_ (${images.length} imágenes)` }
        : { image: { url: images[i]! } }

      await safeSend(() => sock.sendMessage(jid, content, i === 0 ? { quoted: msg } : {}))

      if (i < images.length - 1) await new Promise(r => setTimeout(r, 400))
    }
  },
}

export default command
