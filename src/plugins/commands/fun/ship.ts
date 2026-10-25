import type { Command } from '../../../types/index.js'
import { safeSend } from '@lib/media_sender.js'
import { winsiStore } from '@core/store.js'
import { compatibilidad, veredicto, nombreDePareja, barra } from '@lib/ship.js'

// #ship: la compatibilidad de dos personas (ver ship.ts: la misma pareja da
// siempre lo mismo).

const command: Command = {
  name:        'ship',
  aliases:     ['compatibilidad', 'amor', 'love'],
  description: 'La compatibilidad entre dos personas  |  !ship @uno @otro  ·  !ship @alguien',
  category:    'fun',
  cooldown:    5,

  async execute({ sock, jid, msg, sender, pushName, prefix }) {
    const ctx = msg.message?.extendedTextMessage?.contextInfo
    const menciones = ctx?.mentionedJid ?? []
    // Dos mencionados; uno y el que escribe; o el citado y el que escribe.
    const [a, b] = menciones.length >= 2
      ? [menciones[0]!, menciones[1]!]
      : [sender, menciones[0] ?? ctx?.participant ?? '']
    if (!b) {
      await safeSend(() => sock.sendMessage(jid, { text: `💘 \`${prefix}ship @uno @otro\` · o \`${prefix}ship @alguien\` contigo` }, { quoted: msg }))
      return
    }
    const nombre = (j: string) => (j === sender && pushName) || winsiStore.getName(j)
    const p = compatibilidad(a, b)
    await safeSend(() => sock.sendMessage(jid, {
      text: [
        `💘 *@${a.split('@')[0]}* + *@${b.split('@')[0]}*`,
        `*${nombreDePareja(nombre(a), nombre(b))}*`,
        ``,
        `${barra(p)}  *${p}%*`,
        veredicto(p),
      ].join('\n'),
      mentions: [a, b],
    }, { quoted: msg }))
  },
}

export default command
