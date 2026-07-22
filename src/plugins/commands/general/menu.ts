import type { Command } from '../../../types/index.js'
import { commandRegistry } from '../index.js'
import { config } from '@config'
import { findMediaRandom, safeSend } from '@lib/media_sender.js'
import { sendReply } from '@lib/interactive.js'
import { generateWAMessageFromContent, prepareWAMessageMedia } from '@whiskeysockets/baileys'

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
  owner:      '◉',
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

    text += `\n\n> ${prefix}categoria <nombre> — ver comandos de una categoría`

    // Intentar con media (video/gif/imagen) + newsletter context → "Ver canal"
    const media = await findMediaRandom('menu')
    const NL_JID  = '120363197223158904@newsletter'
    const nlCtx   = {
      isForwarded: true,
      forwardingScore: 1,
      forwardedNewsletterMessageInfo: {
        newsletterJid:   NL_JID,
        newsletterName:  config.botName,
        serverMessageId: Math.floor(Math.random() * 900) + 100,
      },
    }
    const genOpts = msg
      ? { userJid: sock.user?.id ?? '', quoted: msg }
      : { userJid: sock.user?.id ?? '' }

    if (media.buffer && (media.type === 'video' || media.type === 'image')) {
      try {
        const mediaKey  = media.type === 'video' ? 'video' : 'image'
        const prepared  = await prepareWAMessageMedia(
          { [mediaKey]: media.buffer! } as any,
          { upload: sock.waUploadToServer },
        )
        const msgKey    = media.type === 'video' ? 'videoMessage' : 'imageMessage'
        const waMsg     = generateWAMessageFromContent(jid, {
          [msgKey]: {
            ...(prepared as any)[msgKey],
            caption:     text,
            contextInfo: nlCtx,
          },
        } as any, genOpts)
        await safeSend(() => sock.relayMessage(jid, waMsg.message!, { messageId: waMsg.key.id! }))
        return
      } catch {
        // Si falla la preparación de media, caer al texto
      }
    }

    // Sin media o fallo: texto con "Ver canal" vía sendReply
    await sendReply(sock, jid, text, msg)
  },
}

export default command