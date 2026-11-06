import type { Command } from '../../../types/index.js'
import { downloadBuffer } from '@lib/downloader.js'
import { safeSend } from '@lib/media_sender.js'
import { imagenDelMensaje } from '@lib/messages.js'
import { convertirImagen, svgAImagen } from '@lib/imageApi.js'
import { dimensiones, mimeDe } from '@lib/mime.js'

const DEFAULT_AVATAR = 'https://i.imgur.com/8fK4h6J.png'
const MAX_PHOTO_HEIGHT = 700 // evita tweets absurdamente largos con fotos muy verticales

// Pega la foto adjunta debajo de la tarjeta del tweet, como un tweet real con
// imagen: la foto, al ancho de la tarjeta y recortada al centro, y las dos en
// un SVG que la Session API pasa a PNG (render.rs; hasta la 9.3.5, sharp). Si
// falla, se manda solo la tarjeta.
async function attachPhoto(cardBuffer: Buffer, photoBuffer: Buffer): Promise<Buffer> {
  const card = dimensiones(cardBuffer)
  const foto = dimensiones(photoBuffer)
  if (!card || !foto) throw new Error('no se pudo leer el tamaño de la tarjeta o de la foto')
  const width  = card.ancho
  const height = Math.min(MAX_PHOTO_HEIGHT, Math.round(foto.alto * (width / foto.ancho)))
  const resizedPhoto = await convertirImagen(photoBuffer, 'jpeg', 90, { ancho: width, alto: height, ajuste: 'cover' })
  const dato = (b: Buffer) => `data:${mimeDe(b)};base64,${b.toString('base64')}`
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${card.alto + height}">` +
    `<image x="0" y="0" width="${width}" height="${card.alto}" href="${dato(cardBuffer)}"/>` +
    `<image x="0" y="${card.alto}" width="${width}" height="${height}" href="${dato(resizedPhoto)}"/>` +
    `</svg>`
  return svgAImagen(svg, 'png')
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

    const photo = await imagenDelMensaje(msg)
    if (photo) {
      try {
        buffer = await attachPhoto(buffer, photo)
      } catch {
        // No se pudo componer: se manda igual el tweet sin la foto
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
