import type { Command } from '../../../types/index.js'
import { pythonPost } from '@lib/pythonBridge.js'
import { downloadContentFromMessage } from '@whiskeysockets/baileys'

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

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
  name:        'lego',
  aliases:     ['legofy', 'legoimg'],
  description: 'Convierte una imagen en un mosaico estilo LEGO',
  category:    'media',
  cooldown:    15,

  async execute({ sock, jid, msg, args, prefix }) {
    const imageBuffer = await getImageFromMsg(msg)
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

    const result = await pythonPost<{
      success:     boolean
      image?:      string
      error?:      string
      brick_size?: number
      original?:   { w: number; h: number }
      bricks?:     { w: number; h: number }
    }>('/api/v1/imagefx/lego', { image: imageB64, brick_size: brickSize }, 20_000)
      .catch(() => null)

    if (!result?.data?.success || !result.data.image) {
      await sock.sendMessage(jid, {
        text: `✗ Error: ${result?.data?.error ?? 'Error desconocido'}`,
        edit: key,
      } as any)
      return
    }

    await sock.sendMessage(jid, { text: '✔ Listo', edit: key } as any)
    await sleep(150)

    const bricks = result.data.bricks
    const caption = [
      `◆ Mosaico LEGO`,
      bricks ? `§ ${bricks.w}x${bricks.h} fichas` : '',
    ].filter(Boolean).join('\n')

    await sock.sendMessage(jid, {
      image:   Buffer.from(result.data.image, 'base64'),
      caption,
    }, { quoted: msg })
  },
}

export default command
