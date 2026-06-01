import type { Command } from '../../../types/index.js'
import { safeSend } from '@lib/media_sender.js'
import { subBots } from './serbot.js'
import path from 'path'
import fs from 'fs'

const SUB_DIR = path.join(process.cwd(), 'data', 'subbots')

const command: Command = {
  name:      'stopbot',
  aliases:   ['salirbot', 'desconectarbot'],
  description: 'Desconectarte como sub-bot',
  category:  'general',
  groupOnly: false,

  async execute({ sock, jid, msg, sender, isGroup }) {

    // solo en privado
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

    const bot = subBots.get(phone)
    if (!bot) {
      await safeSend(() => sock.sendMessage(jid, {
        text: `§ No estás registrado como sub-bot`,
      }, { quoted: msg }))
      return
    }

    // desconectar
    try {
      bot.sock?.ev?.removeAllListeners()
      bot.sock?.ws?.close()
    } catch {}

    subBots.delete(phone)

    // borrar sesión
    const subPath = path.join(SUB_DIR, phone)
    if (fs.existsSync(subPath))
      fs.rmSync(subPath, { recursive: true, force: true })

    await safeSend(() => sock.sendMessage(jid, {
      text: `✔ Desconectado correctamente\n§ Ya no eres sub-bot`,
    }, { quoted: msg }))
  },
}

export default command