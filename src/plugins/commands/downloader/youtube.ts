import type { Command } from '../../../types/index.js'
import { downloadYoutubeAudio, getYoutubeInfo, downloadBuffer } from '@lib/downloader.js'

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m} minutos ${s} segundos`
}

function formatSize(bytes: number): string {
  const mb = bytes / (1024 * 1024)
  return `${mb.toFixed(2)}MB`
}

const command: Command = {
  name: 'ytmp3',
  aliases: ['yt', 'youtube', 'ytaudio'],
  description: 'Descarga audio de YouTube',
  category: 'downloader',
  cooldown: 15,

  async execute({ sock, jid, msg, args }) {
    const query = args.join(' ').trim()

    if (!query) {
      await sock.sendMessage(jid, {
        text: 'Uso: #yt <nombre o url>',
      }, { quoted: msg })
      return
    }

    // animacion de busqueda
    const sent = await sock.sendMessage(jid, {
      text: '◈ Buscando en YouTube...',
    }, { quoted: msg })
    const key = sent?.key

    const frames = [
      '◈◈ Encontrado...',
      '◈◈◈ Descargando audio...',
      '◈◈ Convirtiendo a MP3...',
    ]

    // obtener info y animar en paralelo
    const [info] = await Promise.all([
      getYoutubeInfo(query).catch(() => null),
      (async () => {
        for (const frame of frames) {
          await sleep(600)
          await sock.sendMessage(jid, { text: frame, edit: key } as any)
        }
      })(),
    ])

    // descargar audio
    const result = await downloadYoutubeAudio(query)
    const size   = formatSize(result.buffer.length)

    await sock.sendMessage(jid, { text: '✔ Listo', edit: key } as any)
    await sleep(200)

    // enviar miniatura con info
    if (info) {
      try {
        const thumb = await downloadBuffer(info.thumbnail)
        const caption = [
          `𒉺═══「 << ❙◀ ⟳ ▷ ▶❙ >> 」═══𒉺`,
          ``,
          ` 𒁈 Descargando *<${info.title}>*`,
          ``,
          `> ➽ Canal » ${info.uploader}`,
          `> ⴵ Duracion » ${formatDuration(info.duration)}`,
          `> ☆ Calidad » 128 kbps`,
          `> □ Tamaño » ${size}`,
          `> 🜸 Link » https://youtu.be/${info.url.split('v=')[1] ?? info.url.split('/').pop()}`,
        ].join('\n')

        await sock.sendMessage(jid, {
          image:   thumb,
          caption,
        }, { quoted: msg })

        await sleep(300)
      } catch {}
    }

    // enviar audio
    await sock.sendMessage(jid, {
      audio:    result.buffer,
      mimetype: 'audio/mpeg',
      ptt:      false,
    }, { quoted: msg })
  },
}

export default command