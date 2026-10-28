import type { Command } from '../../../types/index.js'
import { saveAll } from '@core/persistence.js'
import { sessionClient } from '@lib/session.js'

const command: Command = {
  name:        'restart',
  aliases:     ['reiniciar', 'reboot', 'reset'],
  description: 'Reinicia el bot: guarda todo y sale, y el supervisor de npm start lo vuelve a levantar',
  category:    'owner',
  ownerOnly:   true,

  async execute({ sock, jid, msg }) {
    const sent = await sock.sendMessage(jid, {
      text: '◈ Preparando reinicio...',
    }, { quoted: msg })
    const key = sent?.key

    const frames = [
      '◈◈ Guardando estado...',
      '◈◈◈ Cerrando conexión...',
      '◉ Reiniciando bot...',
    ]

    for (const frame of frames) {
      await new Promise(r => setTimeout(r, 700))
      await sock.sendMessage(jid, { text: frame, edit: key } as any).catch(() => {})
    }

    // Guardar de verdad antes de salir. Hasta la 8.18.0 el mensaje decía
    // "Guardando estado..." y salía sin guardar nada: se perdía lo de desde el
    // último autoguardado (hasta 30 s). Lo mismo que el apagado normal de
    // index.ts: primero las creds, con techo de 2 s, después los datos.
    await Promise.race([
      sessionClient.flushNow().catch(() => {}),
      new Promise(r => setTimeout(r, 2_000)),
    ])
    await saveAll().catch(() => {})
    // El supervisor (npm start) lo relanza con cualquier código de salida. La
    // Session API y Cosxamix siguen corriendo y el bot nuevo los reutiliza: el
    // modelo no se vuelve a cargar.
    process.exit(0)
  },
}

export default command
