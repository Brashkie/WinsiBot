import type { Command } from '../../../types/index.js'
import { getOrCreateGroup, updateGroup } from '@lib/pythonBridge.js'

const command: Command = {
  name: 'antilink',
  aliases: ['antienlace'],
  description: 'Activa/desactiva antilink en el grupo',
  category: 'admin',
  groupOnly: true,
  adminOnly: true,

  async execute({ sock, jid, msg, args }) {
    const group  = await getOrCreateGroup(jid)
    if (!group) {
      await sock.sendMessage(jid, { text: '❌ Error obteniendo config del grupo.' }, { quoted: msg })
      return
    }

    const toggle = args[0]?.toLowerCase()
    const enable = toggle === 'on' || toggle === 'activar'
      ? true
      : toggle === 'off' || toggle === 'desactivar'
      ? false
      : !group.antilink

    await updateGroup({ jid, antilink: enable })

    await sock.sendMessage(jid, {
      text: `🔗 Antilink ${enable ? '✅ activado' : '❌ desactivado'}.`,
    }, { quoted: msg })
  },
}

export default command