import type { Command } from '../../../types/index.js'
import { safeSend } from '@lib/media_sender.js'
import { getGroupRecent, summarizeTranscript, type GroupRecent } from '@lib/nativeBridge.js'
import { winsiStore } from '@core/store.js'
import { horaLocal } from '@lib/utils.js'

// "¿Qué me perdí?": un resumen de lo que se dijo en el grupo.
//
// Los mensajes ya están en la Session API —cada mensaje de grupo pasa por
// /ai/observe para el estilo del grupo—, así que esto no guarda nada nuevo.
// Con IA, la IA resume; sin IA (o si no contesta) se arma uno con lo que sí se
// puede contar sin inventar: quién habló, de qué palabras, qué quedó sin
// responder. Nunca una frase de plantilla: eso no es un resumen.

const MAX_TRANSCRIPT = 6000   // caracteres que se le mandan a la IA
const MAX_LINEA      = 220    // un mensaje largo no se come el resto

function nombre(jid: string): string {
  return winsiStore.getName(jid)
}

/** "Nombre: mensaje" por línea, de lo más nuevo hacia atrás hasta llenar el tope. */
function transcript(r: GroupRecent): string {
  const lineas: string[] = []
  let total = 0
  for (let i = r.messages.length - 1; i >= 0; i--) {
    const m = r.messages[i]!
    let t = m.text.replace(/\s+/g, ' ').trim()
    if (!t) continue
    if (t.length > MAX_LINEA) t = t.slice(0, MAX_LINEA) + '…'
    const l = `${nombre(m.sender)}: ${t}`
    if (total + l.length + 1 > MAX_TRANSCRIPT) break
    lineas.push(l)
    total += l.length + 1
  }
  return lineas.reverse().join('\n')
}

/** El resumen sin IA: solo lo que se puede contar. */
function resumenSinIa(r: GroupRecent): string[] {
  const out: string[] = []
  const top = r.participants.slice(0, 5)
    .map(p => `${nombre(p.sender)} (${p.count})`)
  if (top.length) out.push(`👥 *Hablaron:* ${top.join(', ')}`)
  if (r.keywords.length) out.push(`🏷️ *Temas:* ${r.keywords.slice(0, 6).join(', ')}`)

  // Las últimas preguntas: lo que más probablemente sigue esperando respuesta.
  const preguntas = r.messages
    .filter(m => m.text.includes('?') && m.text.length >= 8)
    .slice(-3)
    .map(m => `  • ${nombre(m.sender)}: ${m.text.replace(/\s+/g, ' ').slice(0, 120)}`)
  if (preguntas.length) out.push(`❓ *Preguntas recientes:*\n${preguntas.join('\n')}`)
  return out
}

const command: Command = {
  name:        'resumen',
  aliases:     ['quemeperdi', 'qmp', 'perdi', 'summary'],
  description: '¿Qué me perdí? Resume lo que se habló en el grupo  |  !resumen [horas]',
  category:    'util',
  cooldown:    60,
  groupOnly:   true,

  async execute({ sock, jid, msg, args }) {
    const horas = Math.min(Math.max(parseInt(args[0] ?? '') || 12, 1), 72)

    const r = await getGroupRecent(jid, 150, horas)
    if (!r) {
      await safeSend(() => sock.sendMessage(jid, {
        text: `> No pude leer el historial ahora. Intenta en un rato.`,
      }, { quoted: msg }))
      return
    }
    if (r.messages.length < 5) {
      await safeSend(() => sock.sendMessage(jid, {
        text: `> En las últimas ${horas} h casi no se habló (${r.messages.length} mensajes). No hay nada que resumir.`,
      }, { quoted: msg }))
      return
    }

    const desde = horaLocal(r.messages[0]!.ts)
    const hasta = horaLocal(r.messages[r.messages.length - 1]!.ts)
    const cabecera = `📝 *¿Qué me perdí?* — ${r.messages.length} mensajes, de ${desde} a ${hasta}`

    const ia = await summarizeTranscript(transcript(r), jid)
    const cuerpo = ia ? [ia] : resumenSinIa(r)

    await safeSend(() => sock.sendMessage(jid, {
      text: [cabecera, '', ...cuerpo].join('\n'),
    }, { quoted: msg }))
  },
}

export default command
