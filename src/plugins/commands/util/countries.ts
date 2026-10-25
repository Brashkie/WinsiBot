import type { Command } from '../../../types/index.js'
import { safeSend } from '@lib/media_sender.js'
import { miembros, esElBot } from '@lib/members.js'
import { contarPaises, bandera } from '@lib/countries.js'

// #paises: de dónde son los miembros del grupo, por el prefijo de su número.
// En grupos con LID, el número de algunos no está a la vista: esos se cuentan
// aparte, sin adivinar.

const command: Command = {
  name:        'paises',
  aliases:     ['países', 'countries', 'pais', 'país'],
  description: 'De qué países son los miembros del grupo',
  category:    'util',
  cooldown:    15,
  groupOnly:   true,

  async execute({ sock, jid, msg }) {
    const ms = (await miembros(sock, jid).catch(() => [])).filter(m => !esElBot(sock, m))
    if (!ms.length) {
      await safeSend(() => sock.sendMessage(jid, { text: `> No pude leer los miembros del grupo.` }, { quoted: msg }))
      return
    }
    const conNumero = ms.filter(m => m.numero).map(m => m.numero!)
    const ocultos = ms.length - conNumero.length
    const conteo = contarPaises(conNumero)
    const ancho = String(conteo[0]?.cantidad ?? 0).length
    await safeSend(() => sock.sendMessage(jid, {
      text: [
        `╭─「 🌎 PAÍSES DEL GRUPO 」`,
        `│`,
        ...conteo.map(c => `│ ${c.pais ? bandera(c.pais.iso) : '🏳️'} ${String(c.cantidad).padStart(ancho)}  ${c.pais?.nombre ?? 'Otros'}`),
        ocultos ? `│ 🔒 ${String(ocultos).padStart(ancho)}  Número oculto (LID)` : '',
        `│`,
        `╰─ ${ms.length} miembros · ${conteo.filter(c => c.pais).length} países`,
      ].filter(Boolean).join('\n'),
    }, { quoted: msg }))
  },
}

export default command
