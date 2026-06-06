import type { Command } from '../../../types/index.js'
import { config } from '@config'
import { safeSend } from '@lib/media_sender.js'
import { existsSync, readdirSync, unlinkSync } from 'fs'
import { join } from 'path'

const command: Command = {
  name:        'clearsession',
  aliases:     ['clearsess', 'limpiarsesion'],
  description: 'Elimina archivos de sesión excepto creds.json',
  category:    'owner',
  ownerOnly:   true,

  async execute({ sock, jid, msg }) {
    const sessionDir = join(process.cwd(), config.sessionPath ?? 'auth')

    if (!existsSync(sessionDir)) {
      await safeSend(() => sock.sendMessage(jid, {
        text: `§ Carpeta de sesión no encontrada: ${sessionDir}`,
      }, { quoted: msg }))
      return
    }

    let deleted = 0
    const files = readdirSync(sessionDir)

    for (const file of files) {
      if (file === 'creds.json') continue
      try {
        unlinkSync(join(sessionDir, file))
        deleted++
      } catch {}
    }

    await safeSend(() => sock.sendMessage(jid, {
      text: [
        `✔ *Sesión limpiada*`,
        ``,
        `§ Archivos eliminados: ${deleted}`,
        `§ creds.json conservado`,
      ].join('\n'),
    }, { quoted: msg }))
  },
}

export default command
