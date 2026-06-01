import type { Command } from '../../../types/index.js'
import { downloadContentFromMessage } from '@whiskeysockets/baileys'

const command: Command = {
  name: 'tag',
  aliases: ['tagall', 'todos', 'all'],
  description: 'Menciona a todos los miembros del grupo',
  category: 'admin',
  groupOnly: true,

  async execute({ sock, jid, msg, args }) {
    const metadata     = await sock.groupMetadata(jid)
    const participants = metadata.participants
    const mentions     = participants.map(p => p.id)
    const text         = args.join(' ').trim()

    const ctx       = msg.message?.extendedTextMessage?.contextInfo
    const quotedMsg = ctx?.quotedMessage

    // ─── con cita ─────────────────────────────────────────────────────────────
    if (quotedMsg) {
      const msgType = Object.keys(quotedMsg)[0] ?? ''

      // imagen
      if (msgType === 'imageMessage' && quotedMsg.imageMessage) {
        try {
          const stream = await downloadContentFromMessage(quotedMsg.imageMessage, 'image')
          const chunks: Buffer[] = []
          for await (const chunk of stream) chunks.push(chunk)
          const buffer  = Buffer.concat(chunks)
          const caption = text
            || quotedMsg.imageMessage.caption
            || ''

          await sock.sendMessage(jid, {
            image:   buffer,
            caption,
            mentions,
          })
          return
        } catch {}
      }

      // video
      if (msgType === 'videoMessage' && quotedMsg.videoMessage) {
        try {
          const stream = await downloadContentFromMessage(quotedMsg.videoMessage, 'video')
          const chunks: Buffer[] = []
          for await (const chunk of stream) chunks.push(chunk)
          const buffer  = Buffer.concat(chunks)
          const caption = text
            || quotedMsg.videoMessage.caption
            || ''

          await sock.sendMessage(jid, {
            video:   buffer,
            caption,
            mentions,
          })
          return
        } catch {}
      }

      // sticker
      if (msgType === 'stickerMessage' && quotedMsg.stickerMessage) {
        try {
          const stream = await downloadContentFromMessage(quotedMsg.stickerMessage, 'sticker')
          const chunks: Buffer[] = []
          for await (const chunk of stream) chunks.push(chunk)
          const buffer = Buffer.concat(chunks)

          await sock.sendMessage(jid, {
            sticker:  buffer,
            mentions,
          })
          return
        } catch {}
      }

      // audio
      if (msgType === 'audioMessage' && quotedMsg.audioMessage) {
        try {
          const stream = await downloadContentFromMessage(quotedMsg.audioMessage, 'audio')
          const chunks: Buffer[] = []
          for await (const chunk of stream) chunks.push(chunk)
          const buffer = Buffer.concat(chunks)

          await sock.sendMessage(jid, {
            audio:    buffer,
            mimetype: quotedMsg.audioMessage.mimetype ?? 'audio/ogg; codecs=opus',
            ptt:      quotedMsg.audioMessage.ptt ?? false,
            mentions,
          })
          return
        } catch {}
      }

      // texto
      const quotedText =
        quotedMsg.conversation ??
        quotedMsg.extendedTextMessage?.text ??
        quotedMsg.imageMessage?.caption ??
        quotedMsg.videoMessage?.caption ??
        ''

      await sock.sendMessage(jid, {
        text:     text ? `${text}\n\n${quotedText}` : quotedText || '.',
        mentions,
      })
      return
    }

    // ─── sin cita — texto solo ────────────────────────────────────────────────
    await sock.sendMessage(jid, {
      text:     text || '.',
      mentions,
    })
  },
}

export default command