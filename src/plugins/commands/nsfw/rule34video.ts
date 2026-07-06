import type { Command } from '../../../types/index.js'
import { getGroupConfig } from '@core/events.js'
import { searchRule34, isVideoPost } from '@lib/rule34.js'

const command: Command = {
  name:        'rule34video',
  aliases:     ['r34video', 'r34v', 'rvideo34'],
  description: 'Busca un video en Rule34 — requiere nsfw activado',
  category:    'nsfw' as any,
  cooldown:    15,
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
        text: `✗ Especifica una búsqueda.\nEjemplo: ${prefix}rule34video hinata`,
      }, { quoted: msg })
      return
    }

    const posts  = await searchRule34(`${query} video`).catch(() => [])
    const videos = posts.filter(isVideoPost)

    if (!videos.length) {
      await sock.sendMessage(jid, {
        text: `✗ No se encontraron videos para "${query}".`,
      }, { quoted: msg })
      return
    }

    const post = videos[Math.floor(Math.random() * videos.length)]!

    await sock.sendMessage(jid, {
      video:   { url: post.file_url },
      caption: `🔞 *${query}*\n§ ${videos.length} resultados`,
    }, { quoted: msg })
  },
}

export default command
