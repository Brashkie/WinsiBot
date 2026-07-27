import type { Command } from '../../../types/index.js'
import { getUserData } from '@core/events.js'
import { readStickerFile } from '@lib/stickerVault.js'

const command: Command = {
  name:        'stickers',
  aliases:     ['misstickers', 'buscarsticker'],
  description: 'Lista o busca tus stickers guardados — #stickers <nombre> reenvía el que coincida',
  category:    'sticker',
  cooldown:    3,

  async execute({ sock, jid, msg, args, sender }) {
    const saved = getUserData(sender).savedStickers ?? []

    if (!saved.length) {
      await sock.sendMessage(jid, {
        text: `╭─「 🖼️ TUS STICKERS 」\n│\n│ Todavía no guardaste ninguno.\n│\n> Respondé a un sticker con \`#savesticker <nombre>\` para guardarlo\n╰─`,
      }, { quoted: msg })
      return
    }

    const query = args.join(' ').trim()

    // ── sin query — listar ────────────────────────────────────────────────────
    if (!query) {
      const rows  = saved.slice(0, 30).map(s => `│ ⭐ ${s.name}`)
      const extra = saved.length > 30 ? [`│`, `│ … y ${saved.length - 30} más`] : []
      await sock.sendMessage(jid, {
        text: [
          `╭─「 🖼️ TUS STICKERS — ${saved.length} 」`,
          `│`,
          ...rows,
          ...extra,
          `│`,
          `> #stickers <nombre> — reenviar uno`,
          `> #delsticker <nombre> — borrar uno`,
          `╰─`,
        ].join('\n'),
      }, { quoted: msg })
      return
    }

    // ── con query — buscar ────────────────────────────────────────────────────
    const needle = query.toLowerCase()
    const exact  = saved.find(s => s.name.toLowerCase() === needle)
    const match  = exact ? [exact] : saved.filter(s => s.name.toLowerCase().includes(needle))

    if (!match.length) {
      await sock.sendMessage(jid, {
        text: `✗ No tenés ningún sticker guardado como *${query}*.\n> #stickers — ver todos`,
      }, { quoted: msg })
      return
    }

    if (match.length > 1) {
      await sock.sendMessage(jid, {
        text: [
          `✗ Hay varios que coinciden con *${query}*:`,
          ``,
          ...match.slice(0, 15).map(s => `│ ⭐ ${s.name}`),
          ``,
          `> Escribí el nombre completo para reenviarlo`,
        ].join('\n'),
      }, { quoted: msg })
      return
    }

    const buffer = await readStickerFile(match[0]!.path)
    if (!buffer) {
      await sock.sendMessage(jid, {
        text: `✗ Ese sticker ya no está disponible — puede que se haya perdido. Usá \`#delsticker ${match[0]!.name}\` para limpiarlo de tu lista.`,
      }, { quoted: msg })
      return
    }

    await sock.sendMessage(jid, { sticker: buffer }, { quoted: msg })
  },
}

export default command
