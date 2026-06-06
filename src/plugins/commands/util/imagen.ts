import type { Command } from '../../../types/index.js'
import axios from 'axios'

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

const BANNED_WORDS = [
  'porn','porno','xxx','nsfw','hentai','nude','nudes',
  'polla','pene','vagina','culo','teta','coño','puta',
  'sexo','sex','gore','semen','cum','anal','blowjob',
  'ahegao','ecchi','yuri','rule34','furry','bdsm',
  'pedofilia','necrofilia','cp','violacion','zoofilia',
  'verga','pinga','chocha','cuca','panocha',
  'xvideos','xnxx','pornhub','onlyfans',
]

function hasBannedWord(text: string): boolean {
  const l = text.toLowerCase()
  return BANNED_WORDS.some(w => l.includes(w))
}

// ─── DuckDuckGo Images (sin API key) ─────────────────────────────────────────
async function ddgImages(query: string): Promise<string[]> {
  // 1. obtener token VQD del HTML de DDG
  const html = await axios.get<string>('https://duckduckgo.com/', {
    params:  { q: query, kl: 'us-en', iax: 'images', ia: 'images' },
    headers: { 'User-Agent': UA },
    timeout: 8_000,
  })

  const vqd =
    html.data.match(/vqd=["']?([\d-]+)["']?/)?.[1] ??
    html.data.match(/"vqd"\s*:\s*"([\d-]+)"/)?.[1]

  if (!vqd) return []

  // 2. solicitar resultados de imágenes
  const res = await axios.get('https://duckduckgo.com/i.js', {
    params: { l: 'us-en', o: 'json', q: query, vqd, f: ',,,,,', p: '1', s: '0' },
    headers: {
      'Referer':    'https://duckduckgo.com/',
      'User-Agent': UA,
      'Accept':     'application/json, */*',
    },
    timeout: 8_000,
  })

  return ((res.data?.results ?? []) as any[])
    .map((r) => r.image as string)
    .filter((u) => typeof u === 'string' && u.startsWith('http'))
}

async function downloadImage(url: string): Promise<Buffer | null> {
  try {
    const res = await axios.get<ArrayBuffer>(url, {
      responseType:  'arraybuffer',
      headers:       { 'User-Agent': UA, 'Referer': 'https://duckduckgo.com/' },
      timeout:       10_000,
      maxRedirects:  5,
    })
    const ct = (res.headers['content-type'] ?? '') as string
    if (!ct.includes('image')) return null
    return Buffer.from(res.data)
  } catch {
    return null
  }
}

const command: Command = {
  name:        'imagen',
  aliases:     ['img', 'image', 'gimage', 'jpg', 'buscarimg'],
  description: 'Busca una imagen en internet',
  category:    'util',
  cooldown:    10,

  async execute({ sock, jid, msg, args, prefix, command: cmd }) {
    const query = args.join(' ').trim()

    if (!query) {
      await sock.sendMessage(jid, {
        text: [
          `✗ Ingresa algo que buscar.`,
          ``,
          `  Uso: ${prefix}${cmd} <busqueda>`,
          `  Ejemplo: ${prefix}${cmd} perros graciosos`,
        ].join('\n'),
      }, { quoted: msg })
      return
    }

    if (hasBannedWord(query)) {
      await sock.sendMessage(jid, {
        text: `✗ No busques cochinadas 😬`,
      }, { quoted: msg })
      return
    }

    const sent = await sock.sendMessage(jid, {
      text: `◈ Buscando: *${query}*...`,
    }, { quoted: msg })
    const key = sent?.key

    const edit = (t: string) =>
      sock.sendMessage(jid, { text: t, edit: key } as any).catch(() => {})

    // Buscar + descargar en paralelo con animación
    let urls: string[] = []
    const [fetchResult] = await Promise.all([
      (async () => {
        try { urls = await ddgImages(query) } catch { urls = [] }
      })(),
      (async () => {
        await new Promise(r => setTimeout(r, 600))
        await edit('◈◈ Buscando en internet...')
        await new Promise(r => setTimeout(r, 700))
        await edit('◈◈◈ Descargando imagen...')
      })(),
    ])

    if (urls.length === 0) {
      await edit(`✗ No se encontraron imágenes para: *${query}*`)
      return
    }

    // intentar hasta 6 URLs hasta que descargue
    let buffer: Buffer | null = null
    for (const url of urls.slice(0, 6)) {
      buffer = await downloadImage(url)
      if (buffer) break
    }

    if (!buffer) {
      await edit(`✗ No se pudo descargar imagen de *${query}*`)
      return
    }

    await edit(`✔ ¡Listo!`)
    await new Promise(r => setTimeout(r, 150))

    await sock.sendMessage(jid, {
      image:   buffer,
      caption: `◆ *${query}*`,
    }, { quoted: msg })
  },
}

export default command
