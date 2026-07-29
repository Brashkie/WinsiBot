import type { Command } from '../../../types/index.js'
import { commandRegistry } from '../index.js'
import { config, CREDIT_LINE } from '@config'
import { findMediaRandom, safeSend } from '@lib/media_sender.js'
import { sendReply } from '@lib/interactive.js'
import { generateWAMessageFromContent, prepareWAMessageMedia } from '@whiskeysockets/baileys'
import { CATEGORY_SYMBOLS } from './categorySymbols.js'

// rpg y roleplay se listan completas siempre — son las categorías con más
// interacción diaria (economía, mascotas, clanes, escenas). El resto se
// resume por categoría a menos que se pida "menu todo".
const PRIORITY_CATEGORIES = ['rpg', 'roleplay']

function formatCmdLine(cmd: { name: string; aliases?: string[]; description: string }, prefix: string): string {
  const aliases = cmd.aliases?.length
    ? `  (${cmd.aliases.slice(0, 2).map(a => `${prefix}${a}`).join(', ')})`
    : ''
  return `> *${prefix}${cmd.name}*${aliases} — ${cmd.description}`
}

const command: Command = {
  name: 'menu',
  aliases: ['help', 'ayuda'],
  description: 'Muestra todos los comandos disponibles',
  category: 'general',

  async execute({ sock, jid, msg, args, prefix }) {
    // commandRegistry tiene una entrada por CADA alias además del nombre
    // real (así resuelve #s y #sticker al mismo comando) — iterar
    // .values() directo cuenta un comando con 3 alias como 4. Deduplicar
    // por objeto antes de contar, mismo patrón que category.ts/infobot.ts.
    const unique = [...new Map([...commandRegistry.values()].map(c => [c.name, c])).values()]

    const showAll = ['todo', 'all', 'full'].includes((args[0] ?? '').toLowerCase())

    const byCategory = new Map<string, typeof unique>()
    for (const cmd of unique) {
      const list = byCategory.get(cmd.category) ?? []
      list.push(cmd)
      byCategory.set(cmd.category, list)
    }

    const now = new Date().toLocaleTimeString('es-PE', {
      hour: '2-digit', minute: '2-digit',
    })

    let text = `╭═══《𖣐 *${config.botName}* 𖣐》═══⊷❍\n`
    text    += `‖  ${CREDIT_LINE}\n`
    text    += `‖  ${now}  ·  ${unique.length} comandos\n`
    text    += `╰═════════════════⊷\n`

    // ── Categorías prioritarias, listado completo ──────────────────────────────
    for (const cat of PRIORITY_CATEGORIES) {
      const cmds = byCategory.get(cat)
      if (!cmds?.length) continue
      byCategory.delete(cat)

      const symbol = CATEGORY_SYMBOLS[cat] ?? '·'
      text += `\n${symbol} *${cat.toUpperCase()}* — ${cmds.length} comandos\n`
      text += cmds.map(c => formatCmdLine(c, prefix)).join('\n') + '\n'
    }

    // ── Resto de categorías ──────────────────────────────────────────────────
    if (showAll) {
      for (const [cat, cmds] of byCategory) {
        const symbol = CATEGORY_SYMBOLS[cat] ?? '·'
        text += `\n${symbol} *${cat.toUpperCase()}* — ${cmds.length} comandos\n`
        text += cmds.map(c => formatCmdLine(c, prefix)).join('\n') + '\n'
      }
    } else {
      text += `\n◆ *OTRAS CATEGORÍAS*\n`
      for (const [cat, cmds] of byCategory) {
        const symbol = CATEGORY_SYMBOLS[cat] ?? '·'
        text += `${symbol} *${cat.toUpperCase()}*  ·  ${cmds.length} cmds\n`
      }
      text += `\n> ${prefix}menu todo — listado completo de comandos`
    }

    text += `\n> ${prefix}categoria <nombre> — ver comandos de una categoría`

    // Intentar con media (video/gif/imagen) + newsletter context → "Ver canal"
    const media = await findMediaRandom('menu', sock)
    const genOpts = msg
      ? { userJid: sock.user?.id ?? '', quoted: msg }
      : { userJid: sock.user?.id ?? '' }

    if (media.buffer && (media.type === 'video' || media.type === 'image')) {
      try {
        const nlCtx = config.newsletterJid ? {
          isForwarded: true,
          forwardingScore: 1,
          forwardedNewsletterMessageInfo: {
            newsletterJid:   config.newsletterJid,
            newsletterName:  config.botName,
            serverMessageId: Math.floor(Math.random() * 900) + 100,
          },
        } : undefined
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

    // Sin canal/media configurados, o fallo de preparación: texto vía sendReply
    await sendReply(sock, jid, text, msg)
  },
}

export default command
