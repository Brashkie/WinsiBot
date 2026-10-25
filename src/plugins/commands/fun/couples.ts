import type { Command } from '../../../types/index.js'
import { safeSend } from '@lib/media_sender.js'
import { miembros, esElBot } from '@lib/members.js'
import { elegirGanadores } from '@lib/raffle.js'
import { compatibilidad } from '@lib/ship.js'

// #parejas: parejas al azar entre los miembros del grupo, con su
// compatibilidad de #ship. Hasta 5, para no mencionar a medio grupo.

const command: Command = {
  name:        'parejas',
  aliases:     ['couples', 'shipear', 'emparejar'],
  description: 'Parejas al azar del grupo  |  !parejas [cantidad]',
  category:    'fun',
  cooldown:    30,
  groupOnly:   true,

  async execute({ sock, jid, msg, args }) {
    const cuantas = Math.min(Math.max(parseInt(args[0] ?? '') || 3, 1), 5)
    const ms = (await miembros(sock, jid).catch(() => [])).filter(m => !esElBot(sock, m))
    if (ms.length < 2) {
      await safeSend(() => sock.sendMessage(jid, { text: `> Hacen falta al menos dos miembros.` }, { quoted: msg }))
      return
    }
    const elegidos = elegirGanadores(ms.map(m => m.id), cuantas * 2)
    const parejas: [string, string][] = []
    for (let i = 0; i + 1 < elegidos.length; i += 2) parejas.push([elegidos[i]!, elegidos[i + 1]!])
    await safeSend(() => sock.sendMessage(jid, {
      text: [
        `💞 *Parejas del día*`,
        ``,
        ...parejas.map(([a, b], i) => `${i + 1}. @${a.split('@')[0]} 💕 @${b.split('@')[0]}  _(${compatibilidad(a, b)}%)_`),
      ].join('\n'),
      mentions: parejas.flat(),
    }, { quoted: msg }))
  },
}

export default command
