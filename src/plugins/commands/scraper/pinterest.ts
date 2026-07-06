import type { Command } from '../../../types/index.js'
import { safeSend } from '@lib/media_sender.js'
import axios from 'axios'

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

interface PinterestImage { url?: string }
interface PinterestResult { images?: Record<string, PinterestImage> }
interface PinterestApiResponse {
  resource_response?: { data?: { results?: PinterestResult[] } }
}

// ─── API interna de búsqueda de Pinterest (la que usa su propia SPA) ────────
// El HTML inicial de /search/pins/ no trae los resultados reales — Pinterest
// los carga después vía JS llamando a este mismo endpoint. Por eso scrapear
// el HTML estático solo encuentra placeholders/blur-thumbnails, nunca fotos
// reales (ese degradado morado-rosa-naranja es justo eso: un placeholder).
async function pinterestSearch(query: string, limit = 6): Promise<string[]> {
  const data = JSON.stringify({
    options: { query, scope: 'pins', page_size: Math.max(limit * 3, 20) },
    context: {},
  })

  const res = await axios.get<PinterestApiResponse>(
    'https://www.pinterest.com/resource/BaseSearchResource/get/',
    {
      params: {
        source_url: `/search/pins/?q=${encodeURIComponent(query)}`,
        data,
      },
      headers: {
        'User-Agent':              UA,
        'Accept':                  'application/json, text/javascript, */*, q=0.01',
        'Accept-Language':         'en-US,en;q=0.9',
        'X-Requested-With':        'XMLHttpRequest',
        'X-Pinterest-PWS-Handler': 'www/search/[scope].js',
        'Referer':                 `https://www.pinterest.com/search/pins/?q=${encodeURIComponent(query)}`,
      },
      timeout: 14_000,
    },
  )

  const results = res.data?.resource_response?.data?.results ?? []
  const sizeKeys = ['736x', 'orig', '474x', '170x']

  const urls: string[] = []
  for (const item of results) {
    const url = sizeKeys.map(k => item.images?.[k]?.url).find(Boolean)
    if (url) urls.push(url)
    if (urls.length >= limit) break
  }
  return urls
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
