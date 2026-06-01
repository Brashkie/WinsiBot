import type { Command } from '../../../types/index.js'
import { getOrCreateGroup } from '@lib/pythonBridge.js'

const command: Command = {
  name:        'groupinfo',
  aliases:     ['ginfo', 'grupoinfo', 'gcfg'],
  description: 'Muestra la configuración actual del grupo',
  category:    'admin',
  groupOnly:   true,

  async execute({ sock, jid, msg }) {
    const group = await getOrCreateGroup(jid)
    if (!group) {
      await sock.sendMessage(jid, { text: '❌ Error obteniendo info del grupo.' }, { quoted: msg })
      return
    }

    const metadata = await sock.groupMetadata(jid)
    const admins   = metadata.participants
      .filter(p => p.admin)
      .map(p => `@${p.id.replace('@s.whatsapp.net', '')}`)
      .join(', ')

    const text = `╭─「 📋 *Info del Grupo* 」
│
│ 📛 *Nombre:* ${metadata.subject}
│ 👥 *Miembros:* ${metadata.participants.length}
│ 👮 *Admins:* ${admins}
│
│ ⚙️ *Configuración:*
│ ${group.antilink  ? '✅' : '❌'} Antilink
│ ${group.antispam  ? '✅' : '❌'} Antispam
│ ${group.welcome   ? '✅' : '❌'} Bienvenida
│ ${group.muted     ? '✅' : '❌'} Silenciado
│
╰─ ID: ${jid}`

    await sock.sendMessage(jid, { text }, { quoted: msg })
  },
}

export default command