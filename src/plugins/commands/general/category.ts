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
  owner:      '◉',
}

const command: Command = {
  name: 'categoria',
  aliases: ['cat', 'category'],
  description: 'Muestra comandos de una categoria especifica',
  category: 'general',

  async execute({ sock, jid, msg, args, prefix }) {
    const cat = args[0]?.toLowerCase()

    // comandos únicos (el registry indexa nombre + aliases, deduplicamos por name)
    const unique = [...new Map([...commandRegistry.values()].map(c => [c.name, c])).values()]

    // sin argumento — mostrar lista de categorias
    if (!cat) {
      const categories = [...new Set(unique.map(c => c.category))]

      const rows = categories.map(c => {
        const count  = unique.filter(cmd => cmd.category === c).length
        const symbol = CATEGORY_SYMBOLS[c] ?? '·'
        return `> ${symbol} *${c.toUpperCase()}* — ${count} comandos`
      })

      const text = [
        `◈ *${config.botName} — CATEGORÍAS DISPONIBLES*`,
        ``,
        ...rows,
        ``,
        `Usá \`${prefix}category <nombre>\` para ver los comandos de una categoría`,
      ].join('\n')

      await sendWithMedia(sock, jid, text, 'menu', msg)
      return
    }

    // con argumento — mostrar comandos de esa categoria
    const cmds = unique.filter(c => c.category === cat)

    if (!cmds.length) {
      await sock.sendMessage(jid, {
        text: `Categoria *${cat}* no encontrada.\nUsa ${prefix}categoria para ver todas.`,
      }, { quoted: msg })
      return
    }

    const symbol = CATEGORY_SYMBOLS[cat] ?? '·'

    const rows = cmds.map(cmd => {
      const aliases = cmd.aliases?.length
        ? `  (${cmd.aliases.map(a => `${prefix}${a}`).join(', ')})`
        : ''
      return `> *${prefix}${cmd.name}*${aliases} — ${cmd.description}`
    })

    const text = [
      `${symbol} *${cat.toUpperCase()}* — ${cmds.length} comandos`,
      ``,
      ...rows,
    ].join('\n')

    await sendWithMedia(sock, jid, text, cat, msg)
  },
}

export default command