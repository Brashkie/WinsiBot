import type { Command } from '../../../types/index.js'
import { getGroupConfig } from '@core/events.js'
import { searchRule34, isImagePost } from '@lib/rule34.js'

const command: Command = {
  name:        'rule34',
  aliases:     ['r34'],
  description: 'Busca una imagen en Rule34 — requiere nsfw activado',
  category:    'nsfw' as any,
  cooldown:    10,
  groupOnly:   true,

  async execute({ sock, jid, msg, args, prefix }) {
    const config = getGroupConfig(jid)
    if (!config.nsfw) {
      await sock.sendMessage(jid, {
        text: `✗ Los comandos NSFW están desactivados en este grupo.\n\nPide a un admin que active:\n> ${prefix}on nsfw`,
      }, { quoted: msg })
      return
    }

    const query = args.join(' ').trim()
    if (!query) {
      await sock.sendMessage(jid, {
        text: `✗ Especifica una búsqueda.\nEjemplo: ${prefix}rule34 hinata`,
      }, { quoted: msg })
      return
    }

    const posts  = await searchRule34(query).catch(() => [])
    const images = posts.filter(isImagePost)

    if (!images.length) {
      await sock.sendMessage(jid, {
        text: `✗ No se encontraron imágenes para "${query}".`,
      }, { quoted: msg })
      return
    }

    const post = images[Math.floor(Math.random() * images.length)]!

    await sock.sendMessage(jid, {
      image:   { url: post.file_url },
      caption: `🔞 *${query}*\n§ ${images.length} resultados`,
    }, { quoted: msg })
  },
}

export default command
