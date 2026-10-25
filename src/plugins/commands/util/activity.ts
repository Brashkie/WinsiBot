import type { Command } from '../../../types/index.js'
import { safeSend } from '@lib/media_sender.js'
import { getGroupActivity } from '@lib/nativeBridge.js'
import { miembros, esElBot } from '@lib/members.js'
import { winsiStore } from '@core/store.js'
import { fechaHoraLocal } from '@lib/utils.js'

// #actividad: quién escribe cuánto en el grupo. Sale de los mensajes que la
// Session API ya registra para el estilo del grupo (cada mensaje de texto de
// 3 o más caracteres), así que no guarda nada nuevo.

const command: Command = {
  name:        'actividad',
  aliases:     ['activity', 'topmensajes', 'totalmensajes'],
  description: 'Quién escribe más en el grupo  |  !actividad [días]',
  category:    'util',
  cooldown:    15,
  groupOnly:   true,

  async execute({ sock, jid, msg, args }) {
    const dias = Math.min(Math.max(parseInt(args[0] ?? '') || 7, 1), 365)
    const [r, ms] = await Promise.all([getGroupActivity(jid, dias), miembros(sock, jid).catch(() => [])])
    if (!r) {
      await safeSend(() => sock.sendMessage(jid, { text: `> No pude leer la actividad ahora. Intenta en un rato.` }, { quoted: msg }))
      return
    }
    const a = r.activity
    if (!a.total) {
      await safeSend(() => sock.sendMessage(jid, { text: `> En los últimos ${dias} días no hay mensajes registrados en este grupo.` }, { quoted: msg }))
      return
    }

    // Solo los que siguen en el grupo; el historial guarda también a los que se fueron.
    const enGrupo = new Set(ms.flatMap(m => m.ids))
    const lista = ms.length ? a.miembros.filter(m => enGrupo.has(m.sender)) : a.miembros
    // El total de los que se muestran, no de todo el registro: si no, decía
    // "17 mensajes de 2 personas" cuando esas dos habían escrito 12.
    const total = lista.reduce((s, m) => s + m.mensajes, 0)
    const personas = ms.filter(m => !esElBot(sock, m)).length
    const top = lista.slice(0, 15)
    const medallas = ['🥇', '🥈', '🥉']
    const ancho = String(top[0]?.mensajes ?? 0).length

    const desde = a.registro_desde ?? Date.now()
    const ventanaCompleta = Date.now() - desde >= dias * 86_400_000
    await safeSend(() => sock.sendMessage(jid, {
      text: [
        `╭─「 📊 ACTIVIDAD — ${dias} día${dias === 1 ? '' : 's'} 」`,
        `│`,
        ...top.map((m, i) => `│ ${medallas[i] ?? `${String(i + 1).padStart(2)}.`} ${String(m.mensajes).padStart(ancho)}  ${winsiStore.getName(m.sender)}`),
        `│`,
        `│ ${total.toLocaleString()} mensajes de ${lista.length} persona${lista.length === 1 ? '' : 's'}${personas ? ` (de ${personas} en el grupo)` : ''}`,
        ventanaCompleta ? '' : `│ _Hay registro desde el ${fechaHoraLocal(desde)}: la ventana es más corta._`,
        `╰─ Cuenta los mensajes de texto.`,
      ].filter(Boolean).join('\n'),
    }, { quoted: msg }))
  },
}

export default command
