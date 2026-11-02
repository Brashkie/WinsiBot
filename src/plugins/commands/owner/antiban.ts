import type { Command } from '../../../types/index.js'
import { safeSend } from '@lib/media_sender.js'
import { sessionClient } from '@lib/session.js'

// ─────────────────────────────────────────────────────────────────────────────
//  #antiban — el ritmo de salida del bot, y terminar su calentamiento.
//
//  Un número que el antiban no había visto entra en calentamiento: el primer
//  día salen 40 mensajes, y sube día a día. El antiban no puede saber la edad
//  de un número, así que uno con años de uso, vinculado otra vez, también
//  entraba (pasó en la 9.3.0: el bot se quedó mudo casi un día). Ahora el
//  dueño lo dice: `#antiban madurar`.
// ─────────────────────────────────────────────────────────────────────────────

const horas = (ms: number) => (ms >= 3_600_000 ? `${Math.round(ms / 3_600_000)} h` : `${Math.ceil(ms / 60_000)} min`)

const command: Command = {
  name:        'antiban',
  aliases:     [],
  description: 'Estado del antiban; "madurar" termina el calentamiento de un número que ya tiene uso',
  category:    'owner',
  ownerOnly:   true,

  async execute({ sock, jid, msg, args, prefix }) {
    const responder = (text: string) => safeSend(() => sock.sendMessage(jid, { text }, { quoted: msg }))
    const sub = (args[0] ?? '').toLowerCase()

    if (sub === 'madurar' || sub === 'maduro') {
      const estaba = await sessionClient.antibanMature('main')
      if (estaba === null) {
        await responder('✗ La Session API no responde: inténtalo en un momento.')
      } else if (estaba) {
        await responder([
          '✓ *Calentamiento terminado*',
          '',
          '§ El número cuenta como maduro: rigen los topes normales.',
          '§ Lo enviado en las últimas 24 h sigue contando.',
        ].join('\n'))
      } else {
        await responder('§ El número no estaba en calentamiento.')
      }
      return
    }

    const e = await sessionClient.antibanStatus('main')
    if (!e) {
      await responder('✗ La Session API no responde: inténtalo en un momento.')
      return
    }
    const lineas = [
      '◈ *Antiban*',
      '',
      `§ Último minuto: ${e.ultimoMinuto} · última hora: ${e.ultimaHora} · 24 h: ${e.ultimas24h}${e.tope24h ? ` de ${e.tope24h}` : ''}`,
    ]
    if (e.diaCalentamiento !== null) {
      lineas.push(
        `§ *En calentamiento*, día ${e.diaCalentamiento}: el número es nuevo para el antiban.`,
        `  Si ya tiene tiempo de uso: *${prefix}antiban madurar*`,
      )
    }
    if (e.enfriadaMs > 0) lineas.push(`§ Enfriada por WhatsApp (429): ${horas(e.enfriadaMs)} más`)
    if (e.contactosEnEspera > 0) lineas.push(`§ Contactos en espera (463): ${e.contactosEnEspera}`)
    await responder(lineas.join('\n'))
  },
}

export default command
