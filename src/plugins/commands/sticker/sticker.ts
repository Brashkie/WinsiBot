import type { Command } from '../../../types/index.js'
import { makeSticker } from '@lib/sticker.js'
import { downloadMediaMessage } from '@whiskeysockets/baileys'
import { getTempPath, cleanTemp } from '@lib/utils.js'
import { writeFile, readFile } from 'fs/promises'

const command: Command = {
  name: 'sticker',
  aliases: ['s', 'stiker'],
  description: 'Convierte imagen/video a sticker',
  category: 'sticker',

  async execute({ sock, jid, msg, args }) {
    const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage
    const target = quoted ?? msg.message

    const isImage = !!(target?.imageMessage)
    const isVideo = !!(target?.videoMessage)

    if (!isImage && !isVideo) {
      await sock.sendMessage(jid, { text: '❌ Envía o cita una imagen/video con el comando.' }, { quoted: msg })
      return
    }

    const buf = await downloadMediaMessage(
      { ...msg, message: target } as any,
      'buffer',
      {}
    ) as Buffer

    const ext = isImage ? 'jpg' : 'mp4'
    const tmpIn = getTempPath(ext)
    await writeFile(tmpIn, buf)

    const [pack = 'WinsiBot', author = 'Hepein'] = args

    const stickerPath = await makeSticker(tmpIn, {
      pack,
      author,
      animated: isVideo,
    })

    const stickerBuf = await readFile(stickerPath)
    await sock.sendMessage(jid, { sticker: stickerBuf }, { quoted: msg })
    await cleanTemp(tmpIn, stickerPath)
  },
}

export default command