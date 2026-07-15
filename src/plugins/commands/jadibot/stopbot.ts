import type { Command } from '../../../types/index.js'
import { safeSend } from '@lib/media_sender.js'
import { subBots, stopSubBot } from './serbot.js'
import path from 'path'
import fs from 'fs'

const SUB_DIR = path.join(process.cwd(), 'data', 'subbots')

const command: Command = {
  name:        'stopbot',
  aliases:     ['salirbot', 'desconectarbot', 'pararbot'],
  description: 'Desconectarte como sub-bot',
  category:    'jadibot',

  async execute({ sock, jid, msg, sender, isGroup, prefix }) {

    if (isGroup) {
      await safeSend(() => sock.sendMessage(jid, {
        text: `§ Escríbeme en privado para usar este comando`,
      }, { quoted: msg }))
      return
    }

    const phone = sender
      .replace('@s.whatsapp.net', '')
      .replace('@lid', '')
      .replace(/[^0-9]/g, '')

    if (!subBots.has(phone)) {
      await safeSend(() => sock.sendMessage(jid, {
        text: [
          `§ No estás registrado como sub-bot`,
          ``,
          `§ Usa *${prefix}serbot* para conectarte`,
        ].join('\n'),
      }, { quoted: msg }))
      return
    }

    // stopSubBot centraliza toda la limpieza (heartbeat, listeners, logout,
    // desregistro en Rust) — antes este comando la reimplementaba a mano y
    // se saltaba pasos, dejando el heartbeat corriendo y la cuota de Rust
    // sin liberar para ese usuario.
    await stopSubBot(phone)

    // borrar sesión del disco
    const subPath = path.join(SUB_DIR, phone)
    if (fs.existsSync(subPath))
      fs.rmSync(subPath, { recursive: true, force: true })

    await safeSend(() => sock.sendMessage(jid, {
      text: [
        `✔ Desconectado correctamente`,
        ``,
        `§ Ya no eres sub-bot`,
        `§ Usa *${prefix}serbot* para volver a conectarte`,
      ].join('\n'),
    }, { quoted: msg }))
  },
}

export default command
