import type { Command } from '../../../types/index.js'
import {
  downloadYoutubeVideo, getYoutubeInfo, downloadBuffer,
  formatDuration,
} from '@lib/downloader.js'

const QUALITY = '360'

const command: Command = {
  name: 'ytmp4',
  aliases: ['play2', 'mp4', 'ytvideo', 'playvideo'],
  description: 'Descarga video de YouTube',
  category: 'downloader',
  cooldown: 15,

  async execute({ sock, jid, msg, args }) {
    const query = args.join(' ').trim()

    if (!query) {
      await sock.sendMessage(jid, {
        text: 'Uso: #ytmp4 <nombre o url>',
      }, { quoted: msg })
      return
    }

    // Igual que en #ytaudio: lanzamos info + descarga juntas (sin esperar una
    // a la otra), pero solo esperamos `info` antes de mandar la tarjeta — así
    // aparece apenas esté lista la metadata, sin quedar bloqueada por la
    // descarga del video. "Tamaño" no entra en la tarjeta instantánea porque
    // solo se conoce una vez que el video ya se descargó.
    const infoPromise  = getYoutubeInfo(query).catch(() => null)
    const videoPromise = downloadYoutubeVideo(query, QUALITY)

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
        `> ☆ Calidad › *${QUALITY}p*`,
        `> ❒ Enlace › *${info.url}*`,
      ].join('\n')

      if (thumbnail) {
        await sock.sendMessage(jid, { image: thumbnail, caption }, { quoted: msg })
      } else {
        await sock.sendMessage(jid, { text: caption }, { quoted: msg })
      }
    }

    const result = await videoPromise

    await sock.sendMessage(jid, {
      video:    result.buffer,
      mimetype: 'video/mp4',
    }, { quoted: msg })
  },
}

export default command
