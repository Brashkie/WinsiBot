import type { Command } from '../../../types/index.js'
import { downloadYoutubeAudio, getYoutubeInfo, downloadBuffer, formatDuration } from '@lib/downloader.js'

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

    // Lanzar info + descarga AL MISMO TIEMPO (ambas corren en paralelo, ninguna
    // espera a la otra), pero solo esperamos a `info` antes de mandar la tarjeta
    // — así la tarjeta aparece apenas esté lista la metadata (rápido), sin
    // quedar bloqueada por la descarga del audio (que tarda más). El audio ya
    // viene corriendo en segundo plano desde antes, así que no se pierde nada
    // de la mejora de velocidad anterior.
    const infoPromise  = getYoutubeInfo(query).catch(() => null)
    const audioPromise = downloadYoutubeAudio(query)

    const info = await infoPromise

    if (info) {
      let thumbnail: Buffer | null = null
      try { thumbnail = await downloadBuffer(info.thumbnail) } catch {}

      const caption = [
        `*${info.title}*`,
        ``,
        `> ❖ Canal › *${info.uploader}*`,
        `> ⴵ Duración › *${formatDuration(info.duration)}*`,
        `> ❀ Vistas › *${info.views.toLocaleString()}*`,
        `> ✩ Publicado › *${info.uploadedAt}*`,
        `> ❒ Enlace › *${info.url}*`,
      ].join('\n')

      if (thumbnail) {
        await sock.sendMessage(jid, { image: thumbnail, caption }, { quoted: msg })
      } else {
        await sock.sendMessage(jid, { text: caption }, { quoted: msg })
      }
    }

    const result = await audioPromise

    await sock.sendMessage(jid, {
      audio:    result.buffer,
      mimetype: 'audio/mpeg',
      ptt:      false,
    }, { quoted: msg })
  },
}

export default command