import type { Command } from '../../../types/index.js'

const command: Command = {
  name:        'canalid',
  aliases:     ['idcanal', 'getcanal', 'channelid'],
  description: 'Muestra el ID del canal de newsletter actual',
  category:    'owner',
  ownerOnly:   true,

  async execute({ sock, jid, msg }) {
    if (!jid.endsWith('@newsletter')) {
      await sock.sendMessage(jid, {
        text: '❌ Este comando solo funciona desde un *canal de WhatsApp* (newsletter).',
      }, { quoted: msg })
      return
    }

    await sock.sendMessage(jid, {
      text: `📡 *ID del canal:*\n\n\`\`\`${jid}\`\`\``,
    }, { quoted: msg })
  },
}

export default command
