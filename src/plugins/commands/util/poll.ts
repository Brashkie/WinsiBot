import type { Command } from '../../../types/index.js'
import { safeSend } from '@lib/media_sender.js'

// Encuesta NATIVA de WhatsApp: la cuenta de votos la lleva WhatsApp, así que
// el bot no guarda nada, no tiene que escuchar votos, y el resultado se ve
// igual que en una encuesta hecha a mano.

const MIN_OPCIONES = 2
const MAX_OPCIONES = 12   // el tope de WhatsApp

const command: Command = {
  name:        'encuesta',
  aliases:     ['poll', 'votacion', 'votación'],
  description: 'Crea una encuesta  |  !encuesta pregunta | opción 1 | opción 2  (-m para voto múltiple)',
  category:    'util',
  cooldown:    10,

  async execute({ sock, jid, msg, args, prefix }) {
    let texto = args.join(' ').trim()

    // "-m" en cualquier lado: se puede elegir más de una opción.
    const multiple = /(^|\s)-m(\s|$)/.test(texto)
    if (multiple) texto = texto.replace(/(^|\s)-m(\s|$)/, ' ').trim()

    const partes = texto.split('|').map(s => s.trim()).filter(Boolean)
    const [pregunta, ...crudas] = partes

    // Opciones repetidas: WhatsApp las rechaza o las muestra dos veces.
    const opciones = [...new Set(crudas.map(o => o.slice(0, 100)))]

    if (!pregunta || opciones.length < MIN_OPCIONES || opciones.length > MAX_OPCIONES) {
      await safeSend(() => sock.sendMessage(jid, {
        text: [
          `📊 *Encuesta*`,
          ``,
          `\`${prefix}encuesta ¿Dónde comemos? | Pizza | Sushi | Tacos\``,
          `\`${prefix}encuesta -m ¿Qué días puedes? | Lun | Mié | Vie\``,
          ``,
          `> Entre ${MIN_OPCIONES} y ${MAX_OPCIONES} opciones, separadas con *|*.`,
          `> *-m* permite votar por varias.`,
        ].join('\n'),
      }, { quoted: msg }))
      return
    }

    await safeSend(() => sock.sendMessage(jid, {
      poll: {
        name:            pregunta.slice(0, 255),
        values:          opciones,
        selectableCount: multiple ? opciones.length : 1,
      },
    }))
  },
}

export default command
