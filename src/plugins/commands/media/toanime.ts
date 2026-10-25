import type { Command } from '../../../types/index.js'
import { vision } from '@lib/nativeBridge.js'

import { sleep } from '@lib/utils.js'
import { imagenDelMensaje } from '@lib/messages.js'

const command: Command = {
  name:        'toanime',
  aliases:     ['animegan', 'cartoonize'],
  description: 'Convierte una foto real a estilo anime (AnimeGANv2)',
  category:    'media',
  cooldown:    30,

  async execute({ sock, jid, msg }) {
    const imageBuffer = await imagenDelMensaje(msg)
    if (!imageBuffer) {
      await sock.sendMessage(jid, {
        text: [
          `✗ Responde a una imagen con #toanime`,
          ``,
          `  Uso: responde a una foto real con #toanime`,
        ].join('\n'),
      }, { quoted: msg })
      return
    }

    const sent = await sock.sendMessage(jid, {
      text: '◈ Convirtiendo a estilo anime...',
    }, { quoted: msg })
    const key = sent?.key

    const imageB64 = imageBuffer.toString('base64')

    const result = await vision.toAnime(imageB64)
      .catch(() => null)

    if (!result?.success || !result.image) {
      await sock.sendMessage(jid, {
        text: `✗ Error: ${result?.error ?? result?.error ?? 'Error desconocido'}`,
        edit: key,
      } as any)
      return
    }

    await sock.sendMessage(jid, { text: '✔ Listo', edit: key } as any)
    await sleep(150)

    await sock.sendMessage(jid, {
      image:   Buffer.from(result.image, 'base64'),
      caption: `◆ Estilo Anime`,
    }, { quoted: msg })
  },
}

export default command
