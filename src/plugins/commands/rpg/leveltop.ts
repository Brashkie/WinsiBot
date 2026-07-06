import type { Command } from '../../../types/index.js'
import { userData } from '@core/events/index.js'
import { safeSend } from '@lib/media_sender.js'
import { getRank } from './ranks.js'

const PAGE_SIZE = 10

const command: Command = {
  name:        'leveltop',
  aliases:     ['toplevel', 'topnivel', 'niveltop', 'levelrank'],
  description: 'Top de usuarios con más nivel  |  !leveltop [página]',
  category:    'rpg',
  cooldown:    10,

  async execute({ sock, jid, msg, args, prefix }) {
    const page = Math.max(1, parseInt(args[0] ?? '1') || 1)

    // Ordenar por nivel, y por exp como criterio de empate
    const sorted = [...userData.entries()]
      .map(([jid, u]) => ({
        jid,
        name:  u.name || jid.split('@')[0],
        level: u.level,
        exp:   u.exp,
      }))
      .filter(u => u.level > 0)
      .sort((a, b) => b.level - a.level || b.exp - a.exp)

    if (sorted.length === 0) {
      await safeSend(() => sock.sendMessage(jid, {
        text: `> Aún no hay usuarios con nivel registrado.`,
      }, { quoted: msg }))
      return
    }

    const totalPages  = Math.ceil(sorted.length / PAGE_SIZE)
    const clampedPage = Math.min(page, totalPages)
    const slice       = sorted.slice((clampedPage - 1) * PAGE_SIZE, clampedPage * PAGE_SIZE)
    const offset       = (clampedPage - 1) * PAGE_SIZE

    const lines = slice.map((u, i) => {
      const rank = offset + i + 1
      const num  = u.jid.split('@')[0]
      return [
        `✦ ${rank} » ${u.name || num}:`,
        `      Nv.${u.level} — ${getRank(u.level)}`,
      ].join('\n')
    })

    const text = [
      `「✦」Los usuarios con más nivel son:`,
      ``,
      lines.join('\n'),
      ``,
      `• Página ${clampedPage} de ${totalPages}`,
      sorted.length > PAGE_SIZE
        ? `_Usa \`${prefix}leveltop ${clampedPage + 1}\` para ver más_`
        : '',
    ].filter(Boolean).join('\n')

    await safeSend(() => sock.sendMessage(jid, { text }, { quoted: msg }))
  },
}

export default command
