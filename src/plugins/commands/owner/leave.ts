import type { Command } from '../../../types/index.js'

const command: Command = {
  name:        'leave',
  aliases:     ['leavegc', 'salir', 'salirgrupo'],
  description: 'Hace que el bot salga del grupo actual o de un grupo por ID',
  category:    'owner',
  ownerOnly:   true,

  async execute({ sock, jid, msg, text }) {
    const target = text.trim().endsWith('@g.us') ? text.trim() : jid

    if (target === jid && !jid.endsWith('@g.us')) {
      await sock.sendMessage(jid, {
        text: '§ Este comando solo funciona en grupos o con un ID de grupo',
      }, { quoted: msg })
      return
    }

    await sock.sendMessage(target, {
      text: '◆ Hasta luego 👋',
    })

    await new Promise(r => setTimeout(r, 500))
    await sock.groupLeave(target).catch(() => {})
  },
}

export default command
