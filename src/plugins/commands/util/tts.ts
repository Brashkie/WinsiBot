import type { Command } from '../../../types/index.js'
import { safeSend } from '@lib/media_sender.js'
import { logger } from '@core/logger.js'
import { hablar, MAX_CARACTERES } from '@lib/tts.js'

// Texto a voz, generado en la misma máquina (ver tts.ts): nada sale a internet.

const command: Command = {
  name:        'tts',
  aliases:     ['voz', 'decir', 'habla', 'say'],
  description: `Convierte texto en nota de voz, sin internet  |  !tts <texto> (máx ${MAX_CARACTERES})  ·  o responde a un mensaje`,
  category:    'util',
  cooldown:    10,

  async execute({ sock, jid, msg, args, prefix }) {
    // Sin texto, se lee el mensaje al que se responde.
    const citado = (msg.message?.extendedTextMessage?.contextInfo?.quotedMessage ?? null) as any
    const deCita = citado?.conversation ?? citado?.extendedTextMessage?.text ?? citado?.imageMessage?.caption ?? ''
    const texto = args.join(' ').trim() || String(deCita).trim()

    if (!texto) {
      await safeSend(() => sock.sendMessage(jid, {
        text: `🔊 \`${prefix}tts hola a todos\`  —  o responde a un mensaje con \`${prefix}tts\``,
      }, { quoted: msg }))
      return
    }

    try {
      const { audio } = await hablar(texto)
      await safeSend(() => sock.sendMessage(jid, {
        audio, mimetype: 'audio/ogg; codecs=opus', ptt: true,
      }, { quoted: msg }))
    } catch (err: any) {
      logger.warn({ err: String(err?.message ?? err) }, 'tts: no se pudo generar')
      await safeSend(() => sock.sendMessage(jid, {
        text: `> No hay un motor de voz disponible en el servidor. El dueño del bot puede instalar *espeak-ng* (en Termux: \`pkg install espeak\`) o configurar *Piper*.`,
      }, { quoted: msg }))
    }
  },
}

export default command
