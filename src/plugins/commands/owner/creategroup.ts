import type { Command } from '../../../types/index.js'
import { safeSend } from '@lib/media_sender.js'

const command: Command = {
  name:        'creategroup',
  aliases:     ['creargc', 'newgroup', 'nuevogc'],
  description: 'Crea un nuevo grupo',
  category:    'owner',
  ownerOnly:   true,

  async execute({ sock, jid, msg, args, sender }) {
    const name = args.join(' ').trim()

    if (!name) {
      await safeSend(() => sock.sendMessage(jid, {
        text: '§ Escribe el nombre del grupo\nEjemplo: !creategroup Mi Grupo',
      }, { quoted: msg }))
      return
    }

    // Incluir al owner como miembro inicial
    const group = await sock.groupCreate(name, [sender]).catch((e: any) => {
      throw new Error(e?.message ?? 'Error al crear grupo')
    })

    const link = await sock.groupInviteCode(group.id as string).catch(() => null)
    const url  = link ? `https://chat.whatsapp.com/${link}` : null

    await safeSend(() => sock.sendMessage(jid, {
      text: [
        `✔ *Grupo creado*`,
        ``,
        `§ Nombre: *${name}*`,
        url ? `§ Link:   ${url}` : '',
      ].filter(Boolean).join('\n'),
    }, { quoted: msg }))
  },
}

export default command
