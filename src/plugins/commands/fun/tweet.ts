import type { Command } from '../../../types/index.js'
import { downloadContentFromMessage } from '@whiskeysockets/baileys'
import { downloadBuffer } from '@lib/downloader.js'
import { safeSend } from '@lib/media_sender.js'

const DEFAULT_AVATAR = 'https://i.imgur.com/8fK4h6J.png'
const MAX_PHOTO_HEIGHT = 700 // evita tweets absurdamente largos con fotos muy verticales

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

// Pega la foto adjunta debajo de la tarjeta del tweet, como un tweet real con
// imagen. `sharp` es optionalDependency — si no está disponible (o falla),
// se degrada mandando solo la tarjeta de texto sin la foto.
async function attachPhoto(cardBuffer: Buffer, photoBuffer: Buffer): Promise<Buffer> {
  const sharp  = (await import('sharp')).default
  const card   = sharp(cardBuffer)
  const meta   = await card.metadata()
  const width  = meta.width ?? 600

  const photoMeta = await sharp(photoBuffer).metadata()
  const scale     = width / (photoMeta.width ?? width)
  const height    = Math.min(MAX_PHOTO_HEIGHT, Math.round((photoMeta.height ?? width) * scale))

  const resizedPhoto = await sharp(photoBuffer)
    .resize({ width, height, fit: 'cover' })
    .toBuffer()

  const cardHeight = meta.height ?? 0

  return sharp({
    create: {
      width,
      height: cardHeight + height,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([
      { input: cardBuffer,    top: 0,         left: 0 },
      { input: resizedPhoto,  top: cardHeight, left: 0 },
    ])
    .png()
    .toBuffer()
}

const command: Command = {
  name:        'tweet',
  aliases:     ['faketweet'],
  description: 'Genera una imagen de tweet falso con tu texto (y foto si adjuntás una)',
  category:    'fun',
  cooldown:    10,

  async execute({ sock, jid, msg, sender, pushName, args, prefix }) {
    const tweetText = args.join(' ').trim()

    if (!tweetText) {
      await sock.sendMessage(jid, {
        text: [
          `✗ Escribe el texto del tweet.`,
          ``,
          `  Uso: ${prefix}tweet <texto>`,
          `  ╰ ${prefix}tweet hoy es un buen día`,
          `  ╰ Mandá o respondé una imagen con ${prefix}tweet <texto> para incluirla`,
        ].join('\n'),
      }, { quoted: msg })
      return
    }

    const username     = sender.split('@')[0] ?? sender
    const displayName  = pushName || username

    let avatar = DEFAULT_AVATAR
    try {
      avatar = (await sock.profilePictureUrl(sender, 'image')) ?? DEFAULT_AVATAR
    } catch {}

    const api = `https://api.some-random-api.com/canvas/misc/tweet?displayname=${encodeURIComponent(displayName)}&username=${encodeURIComponent(username)}&comment=${encodeURIComponent(tweetText)}&theme=dark&avatar=${encodeURIComponent(avatar)}`

    let buffer: Buffer
    try {
      buffer = await downloadBuffer(api)
    } catch {
      await sock.sendMessage(jid, {
        text: `✗ No se pudo generar el tweet, intenta de nuevo.`,
      }, { quoted: msg })
      return
    }

    const photo = await getImageFromMsg(msg)
    if (photo) {
      try {
        buffer = await attachPhoto(buffer, photo)
      } catch {
        // sharp no disponible o falló componiendo — se manda igual el tweet sin la foto
      }
    }

    const caption = [
      `┌───────────────────────`,
      `│ ◆ TWEET GENERADO`,
      `└───────────────────────`,
      ``,
      `  § @${username}`,
    ].join('\n')

    await safeSend(() => sock.sendMessage(jid, {
      image:   buffer,
      caption,
      mentions: [sender],
    }, { quoted: msg }))
  },
}

export default command
