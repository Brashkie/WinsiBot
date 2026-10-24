import type { Command } from '../../../types/index.js'
import { vision } from '@lib/nativeBridge.js'

import { sleep } from '@lib/utils.js'
import { imagenDelMensaje } from '@lib/mensajes.js'

const command: Command = {
  name: 'removebg',
  aliases: ['rmbg', 'sinfondo', 'nobg', 'quitarfondo'],
  description: 'Elimina el fondo de una imagen',
  category: 'media',
  cooldown: 30,

  async execute({ sock, jid, msg, args, prefix }) {
    const imageBuffer = await imagenDelMensaje(msg)

    if (!imageBuffer) {
      await sock.sendMessage(jid, {
        text: [
          `✗ Responde a una imagen con ${prefix}removebg`,
          ``,
          `  Uso: ${prefix}removebg [fondo]`,
          `  ╰ ${prefix}removebg         — fondo transparente`,
          `  ╰ ${prefix}removebg white   — fondo blanco`,
        ].join('\n'),
      }, { quoted: msg })
      return
    }

    const bg = args[0] === 'white' || args[0] === 'blanco'
      ? 'white'
      : 'transparent'

    const sent = await sock.sendMessage(jid, {
      text: '◈ Procesando imagen...',
    }, { quoted: msg })
    const key = sent?.key

    const frames = [
      '◈◈ Cargando modelo...',
      '◈◈◈ Detectando sujeto...',
      '◈◈ Eliminando fondo...',
      '◈ Finalizando...',
    ]

    const imageB64 = imageBuffer.toString('base64')

    const [result] = await Promise.all([
      vision.removeBackground(imageB64, bg)
        .catch(() => null),
      (async () => {
        for (const frame of frames) {
          await sleep(800)
          await sock.sendMessage(jid, { text: frame, edit: key } as any)
        }
      })(),
    ])

    if (!result?.success || !result.image) {
      await sock.sendMessage(jid, {
        text: `✗ Error: ${result?.error ?? result?.error ?? 'Error desconocido'}`,
        edit: key,
      } as any)
      return
    }

    await sock.sendMessage(jid, { text: '✔ Listo', edit: key } as any)
    await sleep(200)

    const resultBuffer = Buffer.from(result.image, 'base64')
    const isWhite      = bg === 'white'

    const caption = [
      `◆ Fondo eliminado`,
      `§ Fondo: ${isWhite ? 'blanco' : 'transparente'}`,
    ].join('\n')

    await sock.sendMessage(jid, {
      image:   resultBuffer,
      caption,
    }, { quoted: msg })
  },
}

export default command