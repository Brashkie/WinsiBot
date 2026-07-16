import type { Command } from '../../../types/index.js'
import { userData, getNumber } from '@core/events/index.js'
import { getGroupParticipants } from '@core/groupCache.js'
import { safeSend } from '@lib/media_sender.js'
import { getRank } from './ranks.js'

const PAGE_SIZE = 10

const command: Command = {
  name:        'leveltop',
  aliases:     ['toplevel', 'topnivel', 'niveltop', 'levelrank'],
  description: 'Top de usuarios con más nivel del grupo  |  !leveltop [página]',
  category:    'rpg',
  cooldown:    10,

  async execute({ sock, jid, msg, args, prefix, isGroup }) {
    const page = Math.max(1, parseInt(args[0] ?? '1') || 1)

    // Acota el top a los miembros del grupo — mismo fix que baltop.ts, ver
    // ese archivo para el detalle de por qué (antes mostraba usuarios de
    // cualquier grupo/chat privado, no solo el actual).
    let scopeNums: Set<string> | null = null
    if (isGroup) {
      const participants = await getGroupParticipants(sock, jid)
      scopeNums = new Set(
        participants.flatMap(p => {
          const nums = [getNumber(p.id)]
          const realJid = (p as any).jid as string | undefined
          if (realJid) nums.push(getNumber(realJid))
          return nums.filter(Boolean)
        })
      )
    }

    // Ordenar por nivel, y por exp como criterio de empate
    const sorted = [...userData.entries()]
      .filter(([uJid]) => !scopeNums || scopeNums.has(getNumber(uJid)))
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
        text: isGroup
          ? `> Aún no hay usuarios de este grupo con nivel registrado.`
          : `> Aún no hay usuarios con nivel registrado.`,
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
