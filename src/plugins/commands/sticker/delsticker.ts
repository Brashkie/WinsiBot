import type { Command } from '../../../types/index.js'
import { getUserData, patchUserData } from '@core/events.js'
import { deleteStickerFile } from '@lib/stickerVault.js'

const command: Command = {
  name:        'delsticker',
  aliases:     ['borrarsticker', 'eliminarsticker'],
  description: 'Borra un sticker de tu colección guardada',
  category:    'sticker',
  cooldown:    3,

  async execute({ sock, jid, msg, args, sender }) {
    const query = args.join(' ').trim()
    if (!query) {
      await sock.sendMessage(jid, {
        text: `✗ Uso: \`#delsticker <nombre>\``,
      }, { quoted: msg })
      return
    }

    const saved = getUserData(sender).savedStickers ?? []
    const needle = query.toLowerCase()
    const index  = saved.findIndex(s => s.name.toLowerCase() === needle)

    if (index === -1) {
      await sock.sendMessage(jid, {
        text: `✗ No tenés ningún sticker guardado como *${query}*.\n> #stickers — ver todos`,
      }, { quoted: msg })
      return
    }

    const [removed] = saved.splice(index, 1)
    await deleteStickerFile(removed!.path)
    patchUserData(sender, { savedStickers: saved })

    await sock.sendMessage(jid, { text: `🗑️ Borraste *${removed!.name}* de tu colección.` }, { quoted: msg })
  },
}

export default command
