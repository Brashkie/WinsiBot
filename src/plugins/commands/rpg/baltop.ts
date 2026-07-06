import type { Command } from '../../../types/index.js'
import { userData } from '@core/events/index.js'
import { safeSend } from '@lib/media_sender.js'

const PAGE_SIZE = 10

const command: Command = {
  name:        'baltop',
  aliases:     ['balancetop', 'richtop', 'richlist', 'topbal', 'tbal'],
  description: 'Top de usuarios con más CodPoints  |  !baltop [página]',
  category:    'rpg',
  cooldown:    10,

  async execute({ sock, jid, msg, args, prefix }) {
    const page = Math.max(1, parseInt(args[0] ?? '1') || 1)

    // Ordenar todos los usuarios por riqueza total (billetera + banco)
    const sorted = [...userData.entries()]
      .map(([jid, u]) => ({
        jid,
        name:  u.name || jid.split('@')[0],
        total: u.money + u.bank,
      }))
      .filter(u => u.total > 0)
      .sort((a, b) => b.total - a.total)

    if (sorted.length === 0) {
      await safeSend(() => sock.sendMessage(jid, {
        text: `> Aún no hay usuarios con CodPoints registrados.`,
      }, { quoted: msg }))
      return
    }

    const totalPages = Math.ceil(sorted.length / PAGE_SIZE)
    const clampedPage = Math.min(page, totalPages)
    const slice = sorted.slice((clampedPage - 1) * PAGE_SIZE, clampedPage * PAGE_SIZE)

    const medals = ['✧','✧','✧','✧','✧','✧','✧','✧','✧','✧']
    const offset  = (clampedPage - 1) * PAGE_SIZE

    const lines = slice.map((u, i) => {
      const rank = offset + i + 1
      const num  = u.jid.split('@')[0]
      return [
        `${medals[i]} ${rank} » ${u.name || num}:`,
        `      Total→ ¥${u.total.toLocaleString()} CodPoints`,
      ].join('\n')
    })

    const text = [
      `「✧」Los usuarios con más CodPoints son:`,
      ``,
      lines.join('\n'),
      ``,
      `• Página ${clampedPage} de ${totalPages}`,
      sorted.length > PAGE_SIZE
        ? `_Usa \`${prefix}baltop ${clampedPage + 1}\` para ver más_`
        : '',
    ].filter(Boolean).join('\n')

    await safeSend(() => sock.sendMessage(jid, { text }, { quoted: msg }))
  },
}

export default command
