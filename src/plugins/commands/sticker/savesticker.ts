import type { Command } from '../../../types/index.js'
import type { SavedSticker } from '@core/events.js'
import { getUserData, patchUserData } from '@core/events.js'
import { saveStickerFile } from '@lib/stickerVault.js'
import { downloadMediaMessage } from '@whiskeysockets/baileys'

const MAX_SAVED_STICKERS = 200
const MAX_NAME_LENGTH    = 32

const command: Command = {
  name:        'savesticker',
  aliases:     ['guardarsticker', 'gs'],
  description: 'Guarda un sticker en tu colección personal — respondé a un sticker con este comando',
  category:    'sticker',
  cooldown:    3,

  async execute({ sock, jid, msg, args, sender }) {
    const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage
    const target = quoted ?? msg.message

    if (!target?.stickerMessage) {
      await sock.sendMessage(jid, {
        text: `✗ Respondé a un sticker con \`#savesticker <nombre>\` para guardarlo.`,
      }, { quoted: msg })
      return
    }

    const name = args.join(' ').trim()
    if (!name) {
      await sock.sendMessage(jid, {
        text: `✗ Uso: \`#savesticker <nombre>\`  (respondiendo a un sticker)`,
      }, { quoted: msg })
      return
    }
    if (name.length > MAX_NAME_LENGTH) {
      await sock.sendMessage(jid, {
        text: `✗ El nombre es muy largo — máximo ${MAX_NAME_LENGTH} caracteres.`,
      }, { quoted: msg })
      return
    }

    const user  = getUserData(sender)
    const saved = user.savedStickers ?? []

    if (saved.some(s => s.name.toLowerCase() === name.toLowerCase())) {
      await sock.sendMessage(jid, {
        text: `✗ Ya tenés un sticker guardado como *${name}*. Usá \`#delsticker ${name}\` primero si querés reemplazarlo.`,
      }, { quoted: msg })
      return
    }

    if (saved.length >= MAX_SAVED_STICKERS) {
      await sock.sendMessage(jid, {
        text: `✗ Llegaste al máximo de ${MAX_SAVED_STICKERS} stickers guardados. Borrá alguno con \`#delsticker <nombre>\` para guardar uno nuevo.`,
      }, { quoted: msg })
      return
    }

    const buffer = await downloadMediaMessage(
      { ...msg, message: target } as any,
      'buffer',
      {},
    ) as Buffer

    const { id, path } = await saveStickerFile(sender, buffer)
    const entry: SavedSticker = { id, name, path, savedAt: Date.now() }
    patchUserData(sender, { savedStickers: [...saved, entry] })

    await sock.sendMessage(jid, {
      text: `✅ Sticker guardado como *${name}*.\n> \`#stickers ${name}\` — para volver a mandarlo`,
    }, { quoted: msg })
  },
}

export default command
