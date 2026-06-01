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
  name: 'removebg',
  aliases: ['rmbg', 'sinfondo', 'nobg', 'quitarfondo'],
  description: 'Elimina el fondo de una imagen',
  category: 'media',
  cooldown: 30,

  async execute({ sock, jid, msg, args, prefix }) {
    const imageBuffer = await getImageFromMsg(msg)

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
      pythonPost<{
        success: boolean
        image?:  string
        error?:  string
        format?: string
      }>('/api/v1/anime/removebg', { image: imageB64, bg })
        .catch(() => null),
      (async () => {
        for (const frame of frames) {
          await sleep(800)
          await sock.sendMessage(jid, { text: frame, edit: key } as any)
        }
      })(),
    ])

    if (!result?.data?.success || !result.data.image) {
      await sock.sendMessage(jid, {
        text: `✗ Error: ${result?.data?.error ?? 'Error desconocido'}`,
        edit: key,
      } as any)
      return
    }

    await sock.sendMessage(jid, { text: '✔ Listo', edit: key } as any)
    await sleep(200)

    const resultBuffer = Buffer.from(result.data.image, 'base64')
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