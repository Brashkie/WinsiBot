import type { Command } from '../../../types/index.js'
import { safeSend } from '@lib/media_sender.js'

// Abrir y cerrar el grupo: cerrado, solo los admins pueden escribir.
// `#cerrar` y `#abrir` son atajos de `#grupo cerrar` y `#grupo abrir`.

const CERRAR = new Set(['cerrar', 'close', 'closed', 'cerrado'])
const ABRIR = new Set(['abrir', 'open', 'abierto'])

const command: Command = {
  name:        'grupo',
  aliases:     ['group', 'cerrar', 'abrir', 'cerrargrupo', 'abrirgrupo'],
  description: 'Abre o cierra el grupo (cerrado: solo escriben los admins)  |  !cerrar  ·  !abrir',
  category:    'admin',
  groupOnly:   true,
  adminOnly:   true,

  async execute({ sock, jid, msg, args, prefix, isBotAdmin, command: usado }) {
    const responder = (text: string) => safeSend(() => sock.sendMessage(jid, { text }, { quoted: msg }))
    const accion = (['cerrar', 'abrir', 'cerrargrupo', 'abrirgrupo'].includes(usado) ? usado.replace('grupo', '') : args[0] ?? '').toLowerCase()
    const cerrar = CERRAR.has(accion)
    if (!cerrar && !ABRIR.has(accion)) {
      await responder(`§ \`${prefix}cerrar\` — solo escriben los admins\n§ \`${prefix}abrir\` — escriben todos`)
      return
    }
    if (!isBotAdmin) { await responder('§ Necesito ser admin del grupo para eso'); return }
    try {
      await sock.groupSettingUpdate(jid, cerrar ? 'announcement' : 'not_announcement')
      await responder(cerrar ? '🔒 Grupo cerrado: solo escriben los admins.' : '🔓 Grupo abierto: escriben todos.')
    } catch {
      await responder('§ WhatsApp no dejó cambiarlo ahora.')
    }
  },
}

export default command
