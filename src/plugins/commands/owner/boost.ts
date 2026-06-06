import type { Command } from '../../../types/index.js'
import { safeSend } from '@lib/media_sender.js'

const STAGES = [
  '▒▒▒▒▒▒▒▒▒▒  0%',
  '███▒▒▒▒▒▒▒  30%',
  '██████▒▒▒▒  60%',
  '█████████▒  90%',
  '██████████  100%  ✔',
]

const delay = (ms: number) => new Promise<void>(r => setTimeout(r, ms))

const command: Command = {
  name:        'boost',
  aliases:     ['refresh', 'acelerar'],
  description: 'Reinicia caché y muestra estado del bot',
  category:    'owner',
  ownerOnly:   true,

  async execute({ sock, jid, msg }) {
    const sent = await safeSend(() => sock.sendMessage(jid, {
      text: '⚡ Iniciando boost...',
    }, { quoted: msg }))

    if (!sent?.key) return

    for (const stage of STAGES) {
      await delay(700)
      await safeSend(() => sock.sendMessage(jid, {
        text:  stage,
        edit:  sent.key,
      })).catch(() => {})
    }

    await delay(400)
    await safeSend(() => sock.sendMessage(jid, {
      text: [
        `⚡ *Bot acelerado*`,
        ``,
        `§ Memoria:  ${(process.memoryUsage().rss / 1_048_576).toFixed(1)} MB`,
        `§ Uptime:   ${Math.floor(process.uptime() / 60)} min`,
        `§ Node:     ${process.version}`,
      ].join('\n'),
      edit: sent.key,
    })).catch(() => {})
  },
}

export default command
