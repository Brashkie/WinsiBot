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
    const sessionDir  = join(process.cwd(), config.sessionPath ?? 'auth')
    const jsonPath    = join(sessionDir, 'creds.json')
    const cborPath    = join(sessionDir, 'creds.cbor')
    const isCbor      = !existsSync(jsonPath) && existsSync(cborPath)
    const credsPath   = isCbor ? cborPath : jsonPath

    if (!existsSync(credsPath)) {
      await safeSend(() => sock.sendMessage(jid, {
        text: `§ No se encontró creds.json/creds.cbor en ${sessionDir}`,
      }, { quoted: msg }))
      return
    }

    const file = readFileSync(credsPath)
    const date = new Date().toLocaleDateString('es-PE')
    const ext  = isCbor ? 'cbor' : 'json'

    // Enviar al privado del owner, no al grupo
    const dest = sender.endsWith('@g.us') ? sender : sender

    await safeSend(() => sock.sendMessage(dest, {
      document: file,
      mimetype: isCbor ? 'application/cbor' : 'application/json',
      fileName: `creds_${date.replace(/\//g, '-')}.${ext}`,
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
