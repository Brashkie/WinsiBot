import type { Command } from '../../../types/index.js'
import { legofyImage } from '@lib/nativeBridge.js'

import { sleep } from '@lib/utils.js'
import { imagenDelMensaje } from '@lib/messages.js'

const command: Command = {
  name:        'lego',
  aliases:     ['legofy', 'legoimg'],
  description: 'Convierte una imagen en un mosaico estilo LEGO',
  category:    'media',
  cooldown:    15,

  async execute({ sock, jid, msg, args, prefix }) {
    const imageBuffer = await imagenDelMensaje(msg)
    if (!imageBuffer) {
      await sock.sendMessage(jid, {
        text: [
          `✗ Responde a una imagen con ${prefix}lego`,
          ``,
          `  Uso: ${prefix}lego [tamaño de ficha]`,
          `  ╰ ${prefix}lego         — tamaño por defecto (20px)`,
          `  ╰ ${prefix}lego 10      — fichas chicas, más detalle`,
          `  ╰ ${prefix}lego 30      — fichas grandes, más "pixelado"`,
        ].join('\n'),
      }, { quoted: msg })
      return
    }

    const brickSize = Math.min(48, Math.max(8, parseInt(args[0] ?? '', 10) || 20))

    const sent = await sock.sendMessage(jid, {
      text: '◈ Armando el mosaico LEGO...',
    }, { quoted: msg })
    const key = sent?.key

    const imageB64 = imageBuffer.toString('base64')

    const result = await legofyImage(imageB64, brickSize)

    if (!result?.success || !result.image) {
      await sock.sendMessage(jid, {
        text: `✗ Error: ${result?.error ?? 'Error desconocido'}`,
        edit: key,
      } as any)
      return
    }

    await sock.sendMessage(jid, { text: '✔ Listo', edit: key } as any)
    await sleep(150)

    const bricks = result.bricks
    const caption = [
      `◆ Mosaico LEGO`,
      bricks ? `§ ${bricks.w}x${bricks.h} fichas` : '',
    ].filter(Boolean).join('\n')

    await sock.sendMessage(jid, {
      image:   Buffer.from(result.image, 'base64'),
      caption,
    }, { quoted: msg })
  },
}

export default command
