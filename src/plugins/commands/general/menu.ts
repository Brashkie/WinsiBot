import type { Command } from '../../../types/index.js'
import { commandRegistry } from '../index.js'
import { config } from '@config'
import { sendWithMedia } from '@lib/media_sender.js'

const CATEGORY_SYMBOLS: Record<string, string> = {
  general:    '◈',
  media:      '▣',
  music:      '♪',
  scraper:    '◎',
  ai:         '◇',
  admin:      '▲',
  fun:        '◉',
  util:       '▧',
  downloader: '▼',
  sticker:    '◆',
  roleplay:   '♡',
  nsfw:       '▣',
  info:       '§',
  jadibot:    '⊕',
  rpg:        '⚔',
}

const command: Command = {
  name: 'menu',
  aliases: ['help', 'ayuda'],
  description: 'Muestra todos los comandos disponibles',
  category: 'general',

  async execute({ sock, jid, msg, prefix }) {
    const categories = new Map<string, number>()

    for (const cmd of commandRegistry.values()) {
      categories.set(cmd.category, (categories.get(cmd.category) ?? 0) + 1)
    }

    const now = new Date().toLocaleTimeString('es-PE', {
      hour: '2-digit', minute: '2-digit',
    })

    let text = `╭═══《𖣐 *${config.botName}* 𖣐》═══⊷❍\n`
    text    += `‖  𝕳𝖊𝖕𝖊𝖎𝖓 𝕺𝖋𝖎𝖈𝖎𝖆𝖑 𝖝 𝕭𝖗𝖆𝖘𝖍𝖐𝖎𝖊\n`
    text    += `‖  ${now}  ·  ${commandRegistry.size} comandos\n`
    text    += `╰═════════════════⊷\n`

    for (const [cat, count] of categories) {
      const symbol = CATEGORY_SYMBOLS[cat] ?? '·'
      text += `\n${symbol} *${cat.toUpperCase()}*  ·  ${count} cmds`
    }

    text += `\n\n───────────────────────`
    text += `\n  ${prefix}categoria <nombre>`
    text += `\n  para ver cmds de cada categoria`
    text += `\n───────────────────────`
    text += `\n  Prefix: *${config.prefix.join('  ')}*`

    // random: true — elige aleatoriamente entre menu.mp4, menu1.mp4, menu2.mp4...
    await sendWithMedia(sock, jid, text, 'menu', msg, true)
  },
}

export default command