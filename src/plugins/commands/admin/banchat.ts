import type { Command } from '../../../types/index.js'
import { getGroupConfig, setGroupConfig } from '@core/events/index.js'
import { safeSend } from '@lib/media_sender.js'

const command: Command = {
  name:        'banchat',
  aliases:     ['bangrupo', 'unbanchat', 'unbangrupo'],
  description: 'Silencia/activa el bot en este grupo',
  category:    'admin',
  groupOnly:   true,
  ownerOnly:   true,

  async execute({ sock, jid, msg, command: cmd }) {
    const isBan = cmd === 'banchat' || cmd === 'bangrupo'
    const cfg   = getGroupConfig(jid)

    if (isBan && cfg.muted) {
      await safeSend(() => sock.sendMessage(jid, {
        text: '§ Este grupo ya está silenciado',
      }, { quoted: msg }))
      return
    }

    setGroupConfig(jid, { muted: isBan })

    await safeSend(() => sock.sendMessage(jid, {
      text: isBan
        ? '✗ Bot silenciado en este grupo\n§ Usa !unbanchat para reactivar'
        : '✔ Bot reactivado en este grupo',
    }, { quoted: msg }))
  },
}

export default command
