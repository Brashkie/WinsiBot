import type { Command } from '../../../types/index.js'
import { vision } from '@lib/pythonBridge.js'
import { downloadContentFromMessage } from '@whiskeysockets/baileys'

import { sleep } from '@lib/utils.js'

async function getImageFromMsg(
  msg: import('@whiskeysockets/baileys').WAMessage
): Promise<Buffer | null> {
  try {
    const imgMsg =
      msg.message?.imageMessage ??
      msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage
    if (!imgMsg) return null
    const stream = await downloadContentFromMessage(imgMsg, 'image')
    const chunks: Buffer[] = []
    for await (const chunk of stream) chunks.push(chunk)
    return Buffer.concat(chunks)
  } catch {
    return null
  }
}

const command: Command = {
  name:        'toanime',
  aliases:     ['animegan', 'cartoonize'],
  description: 'Convierte una foto real a estilo anime (AnimeGANv2)',
  category:    'media',
  cooldown:    30,

  async execute({ sock, jid, msg }) {
    const imageBuffer = await getImageFromMsg(msg)
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
