import type { Command } from '../../../types/index.js'
import { getGroupConfig } from '@core/events.js'
import { searchRule34Video, downloadRule34Video } from '@lib/rule34video.js'

const command: Command = {
  name:        'rule34video',
  aliases:     ['r34video', 'r34v', 'rvideo34'],
  description: 'Busca un video en Rule34Video — requiere nsfw activado',
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

    const results = await searchRule34Video(query).catch(() => [])
    if (!results.length) {
      await sock.sendMessage(jid, {
        text: `✗ No se encontraron videos para "${query}".`,
      }, { quoted: msg })
      return
    }

    const pick = results[Math.floor(Math.random() * results.length)]!

    const sent = await sock.sendMessage(jid, {
      text: `◈ Descargando video...`,
    }, { quoted: msg })
    const key = sent?.key

    const buffer = await downloadRule34Video(pick.pageUrl).catch(() => null)
    if (!buffer) {
      await sock.sendMessage(jid, {
        text: `✗ No se pudo descargar el video, intenta de nuevo.`,
        edit: key,
      } as any)
      return
    }

    await sock.sendMessage(jid, { text: '✔ Listo', edit: key } as any)

    await sock.sendMessage(jid, {
      video:   buffer,
      caption: `🔞 *${pick.title}*\n§ ${results.length} resultados para "${query}"`,
    }, { quoted: msg })
  },
}

export default command
