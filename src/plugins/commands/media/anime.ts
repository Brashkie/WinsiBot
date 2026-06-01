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
  name: 'anime',
  aliases: ['anime4k', 'toanime'],
  description: 'Mejora una imagen con Anime4K (x2 o x4)',
  category: 'media',
  cooldown: 30,

  async execute({ sock, jid, msg, args }) {
    const scale = args[0] === '4' ? 4 : 2

    const imageBuffer = await getImageFromMsg(msg)
    if (!imageBuffer) {
      await sock.sendMessage(jid, {
        text: [
          `✗ Responde a una imagen con #anime`,
          ``,
          `  Uso: #anime [escala]`,
          `  Ejemplo: #anime 2  o  #anime 4`,
        ].join('\n'),
      }, { quoted: msg })
      return
    }

    const sent = await sock.sendMessage(jid, {
      text: '◈ Iniciando Anime4K...',
    }, { quoted: msg })
    const key = sent?.key

    const frames = [
      `◈◈ Cargando modelo x${scale}...`,
      '◈◈◈ Procesando imagen...',
      '◈◈ Aplicando upscale...',
      '◈ Finalizando...',
    ]

    const imageB64 = imageBuffer.toString('base64')

    const [result] = await Promise.all([
      pythonPost<{
        success:  boolean
        image?:   string
        error?:   string
        scale?:   number
        original?: { w: number; h: number }
        result?:  { w: number; h: number }
      }>('/api/v1/anime/upscale', { image: imageB64, scale })
        .catch(() => null),
      (async () => {
        for (const frame of frames) {
          await sleep(1_000)
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

    const orig = result.data.original
    const res  = result.data.result

    const caption = [
      `◆ Anime4K x${scale}`,
      orig && res
        ? `§ ${orig.w}x${orig.h} → ${res.w}x${res.h}`
        : '',
    ].filter(Boolean).join('\n')

    await sock.sendMessage(jid, {
      image:   Buffer.from(result.data.image, 'base64'),
      caption,
    }, { quoted: msg })
  },
}

export default command