import type { Command } from '../../../types/index.js'
import { sendCarousel, type CarouselCard } from '@lib/interactive.js'
import { config } from '@config'
import axios from 'axios'

interface AptoideFile {
  vername?:  string
  filesize?: number
  path?:     string
}

interface AptoideStats {
  rating?:    { avg?: number }
  downloads?: number
}

interface AptoideApp {
  name?:    string
  package?: string
  icon?:    string
  file?:    AptoideFile
  stats?:   AptoideStats
}

interface AptoideResponse {
  datalist?: { list?: AptoideApp[] }
}

const command: Command = {
  name:        'apk',
  aliases:     ['apkdl', 'buscarapk'],
  description: 'Busca y descarga APKs desde Aptoide',
  category:    'downloader',
  cooldown:    10,

  async execute({ sock, jid, msg, args, prefix }) {
    const query = args.join(' ').trim()
    if (!query) {
      await sock.sendMessage(jid, {
        text: `◈ Uso: ${prefix}apk <nombre de app>\n§ Ejemplo: ${prefix}apk free fire`,
      }, { quoted: msg })
      return
    }

    await sock.sendMessage(jid, {
      text: `◈ Buscando "${query}" en Aptoide...`,
    }, { quoted: msg })

    let apps: AptoideApp[] = []
    try {
      const res = await axios.get<AptoideResponse>(
        `https://ws75.aptoide.com/api/7/apps/search?query=${encodeURIComponent(query)}&limit=5`,
        {
          timeout: 12_000,
          headers: { AptoideConnect: '7d58195d-0390-445e-b8ad-2b48ca3aea4d' },
        },
      )
      apps = res.data.datalist?.list ?? []
    } catch {
      await sock.sendMessage(jid, {
        text: '✗ Error al conectar con Aptoide. Intenta más tarde.',
      }, { quoted: msg })
      return
    }

    if (!apps.length) {
      await sock.sendMessage(jid, {
        text: `✗ No se encontraron apps para "${query}".`,
      }, { quoted: msg })
      return
    }

    const dlCmd  = `${config.prefix[0] ?? prefix}downloadapk`
    const total  = Math.min(apps.length, 5)

    const cards: CarouselCard[] = apps.slice(0, total).map((app, i) => {
      const name      = app.name     ?? 'App desconocida'
      const version   = app.file?.vername  ?? 'N/A'
      const pkg       = app.package  ?? 'N/A'
      const dlUrl     = app.file?.path     ?? ''
      const sizeMB    = app.file?.filesize
        ? `${(app.file.filesize / 1_048_576).toFixed(1)} MB`
        : '? MB'
      const rating    = app.stats?.rating?.avg
        ? `★ ${app.stats.rating.avg.toFixed(1)}`
        : 'Sin rating'
      const downloads = app.stats?.downloads
        ? `↓ ${app.stats.downloads.toLocaleString()}`
        : ''
      const icon      = app.icon ?? ''
      const safeName  = name.replace(/[^a-zA-Z0-9]/g, '')

      const text = [
        `📱 *${name}*`,
        '',
        `📦 Versión: ${version}`,
        `💾 Tamaño: ${sizeMB}`,
        `${rating}${downloads ? `  ${downloads}` : ''}`,
        `◆ ${pkg}`,
        '',
        `◈ ${i + 1} / ${total}`,
      ].join('\n')

      const card: CarouselCard = {
        text,
        footer:  '📲 Aptoide Store',
        buttons: [
          ['📥 Descargar APK', `${dlCmd} ${dlUrl}|${safeName}.apk`],
          ['🔍 Buscar más',    `${config.prefix[0] ?? prefix}apk ${query}`],
        ],
      }
      if (icon) card.media = icon
      return card
    })

    await sendCarousel(
      sock, jid,
      `📱 APK: "${query}"`,
      '📲 Desliza para ver más',
      cards,
      msg,
    )
  },
}

export default command
