import type { Command } from '../../../types/index.js'
import { userData } from '@core/events/index.js'
import { safeSend } from '@lib/media_sender.js'
import { winsiStore } from '@core/store.js'

// !bc <mensaje>          → grupos + privado
// !bcgroup <mensaje>     → solo grupos
// !bcprivate <mensaje>   → solo privados

const delay = (ms: number) => new Promise<void>(r => setTimeout(r, ms))

const command: Command = {
  name:        'bc',
  aliases:     ['bcgroup', 'bcprivate', 'broadcast'],
  description: 'Envía un mensaje a todos los chats',
  category:    'owner',
  ownerOnly:   true,

  async execute({ sock, jid, msg, command: cmd, text, args }) {
    const content = text.trim()

    if (!content) {
      await safeSend(() => sock.sendMessage(jid, {
        text: '§ Escribe el mensaje\nEjemplo: !bc Hola a todos!',
      }, { quoted: msg }))
      return
    }

    const toGroups  = cmd !== 'bcprivate'
    const toPrivate = cmd !== 'bcgroup'

    await safeSend(() => sock.sendMessage(jid, {
      text: `⏳ Enviando broadcast...`,
    }, { quoted: msg }))

    let sent = 0
    let failed = 0

    if (toGroups) {
      const groups = Object.keys(winsiStore.chats).filter(j => j.endsWith('@g.us'))
      for (const groupJid of groups) {
        try {
          await safeSend(() => sock.sendMessage(groupJid, { text: content }))
          sent++
        } catch {
          failed++
        }
        await delay(1_500)
      }
    }

    if (toPrivate) {
      for (const [userJid] of userData) {
        if (!userJid.endsWith('@s.whatsapp.net')) continue
        try {
          await safeSend(() => sock.sendMessage(userJid, { text: content }))
          sent++
        } catch {
          failed++
        }
        await delay(2_000)
      }
    }

    await safeSend(() => sock.sendMessage(jid, {
      text: [
        `✔ *Broadcast completado*`,
        ``,
        `§ Enviados: ${sent}`,
        `§ Fallidos: ${failed}`,
      ].join('\n'),
    }, { quoted: msg }))
  },
}

export default command
