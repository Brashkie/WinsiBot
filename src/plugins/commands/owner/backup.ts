import type { Command } from '../../../types/index.js'
import { config } from '@config'
import { safeSend } from '@lib/media_sender.js'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'

// !backup → envía creds.json al privado del owner

const command: Command = {
  name:        'backup',
  aliases:     ['respaldo'],
  description: 'Envía la sesión (creds.json) al privado',
  category:    'owner',
  ownerOnly:   true,

  async execute({ sock, jid, msg, sender }) {
    const sessionDir = join(process.cwd(), config.sessionPath ?? 'auth')
    const credsPath  = join(sessionDir, 'creds.json')

    if (!existsSync(credsPath)) {
      await safeSend(() => sock.sendMessage(jid, {
        text: `§ No se encontró creds.json en ${sessionDir}`,
      }, { quoted: msg }))
      return
    }

    const file = readFileSync(credsPath)
    const date = new Date().toLocaleDateString('es-PE')

    // Enviar al privado del owner, no al grupo
    const dest = sender.endsWith('@g.us') ? sender : sender

    await safeSend(() => sock.sendMessage(dest, {
      document: file,
      mimetype: 'application/json',
      fileName: `creds_${date.replace(/\//g, '-')}.json`,
      caption:  `🔐 Backup de sesión — ${date}`,
    }, { quoted: msg }))

    if (dest !== jid) {
      await safeSend(() => sock.sendMessage(jid, {
        text: '✔ Backup enviado a tu privado',
      }, { quoted: msg }))
    }
  },
}

export default command
