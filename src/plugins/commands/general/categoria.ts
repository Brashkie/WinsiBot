import type { Command } from '../../../types/index.js'
import { commandRegistry } from '../index.js'
import { sendWithMedia } from '@lib/media_sender.js'
import { config } from '@config'

const CATEGORY_SYMBOLS: Record<string, string> = {
  general:    '◈', media:      '▣', music:      '♪',
  scraper:    '◎', ai:         '◇', admin:      '▲',
  fun:        '◉', util:       '▧', downloader: '▼',
  sticker:    '◆', roleplay:   '♡', nsfw:       '▣',
  info:       '§', jadibot:    '⊕', rpg:        '⚔',
}

const command: Command = {
  name: 'categoria',
  aliases: ['cat', 'category'],
  description: 'Muestra comandos de una categoria especifica',
  category: 'general',

  async execute({ sock, jid, msg, args, prefix }) {
    const cat = args[0]?.toLowerCase()

    // sin argumento — mostrar lista de categorias
    if (!cat) {
      const categories = [...new Set([...commandRegistry.values()].map(c => c.category))]

      let text = `(つ▀¯▀)つ═𖡼 *${config.botName}* 𖡼═══\n`
      text    += `‖ ❖ *Categorias disponibles*\n`
      text    += `(つ▀¯▀)つ══════════════\n\n`

      for (const c of categories) {
        const count  = [...commandRegistry.values()].filter(cmd => cmd.category === c).length
        const symbol = CATEGORY_SYMBOLS[c] ?? '·'
        text += `${symbol} *${c.toUpperCase()}* 𒀭 ${count} cmds\n`
        text += `> ${prefix}category ${c}\n\n`
      }

      text += `𒉺══════════════𒉺`

      await sendWithMedia(sock, jid, text, 'menu', msg)
      return
    }

    // con argumento — mostrar comandos de esa categoria
    const cmds = [...commandRegistry.values()].filter(c => c.category === cat)

    if (!cmds.length) {
      await sock.sendMessage(jid, {
        text: `Categoria *${cat}* no encontrada.\nUsa ${prefix}categoria para ver todas.`,
      }, { quoted: msg })
      return
    }

    const symbol = CATEGORY_SYMBOLS[cat] ?? '·'

    let text = `(つ▀¯▀)つ═𖡼 *${config.botName}* 𖡼═══\n`
    text    += `‖ ${symbol} *${cat.toUpperCase()}*\n`
    text    += `‖ ${cmds.length} comandos\n`
    text    += `(つ▀¯▀)つ══════════════𒉺\n`

    for (const cmd of cmds) {
      text += `\n ◆ *${prefix}${cmd.name}*`
      if (cmd.aliases?.length) {
        text += `  ${cmd.aliases.map(a => `${prefix}${a}`).join('  ')}`
      }
      text += `\n> ✉ ${cmd.description}\n`
    }

    text += `\n𒉺══════════════𒉺`

    await sendWithMedia(sock, jid, text, cat, msg)
  },
}

export default command