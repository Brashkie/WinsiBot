import type { Command } from '../../../types/index.js'
import { getUserData } from '@core/events.js'
import { getUserInventory } from './rollwaifu.js'
import { safeSend } from '@lib/media_sender.js'

const PAGE_SIZE = 20

const command: Command = {
  name:        'harem',
  aliases:     ['waifus', 'claims', 'coleccion'],
  description: 'Ver los personajes reclamados con #rw  |  !harem [@usuario] [página]',
  category:    'rpg',
  cooldown:    5,

  async execute({ sock, jid, msg, args, sender, pushName, prefix }) {
    const mentioned  = (msg.message?.extendedTextMessage?.contextInfo?.mentionedJid ?? [])[0]
    const target     = mentioned ?? sender
    const isSelf     = target === sender
    const targetData = getUserData(target, isSelf ? pushName : '')
    const name       = targetData.name || (isSelf ? pushName : '') || target.split('@')[0]

    const inventory = getUserInventory(target)

    if (inventory.length === 0) {
      await safeSend(() => sock.sendMessage(jid, {
        text: isSelf
          ? `✗ No tienes personajes reclamados — usa \`${prefix}rw\` para conseguir uno.`
          : `✗ *${name}* no tiene personajes reclamados.`,
        mentions: [target],
      }, { quoted: msg }))
      return
    }

    // Ordenar por valor descendente
    const sorted = [...inventory].sort((a, b) => Number(b.value) - Number(a.value))

    // El último argumento numérico es la página, si lo hay
    const pageArg    = parseInt(args[args.length - 1] ?? '') || 1
    const totalPages = Math.ceil(sorted.length / PAGE_SIZE)
    const page       = Math.min(Math.max(1, pageArg), totalPages)
    const start      = (page - 1) * PAGE_SIZE
    const slice      = sorted.slice(start, start + PAGE_SIZE)

    const lines = slice.map(c => `» *${c.name}* (${Number(c.value).toLocaleString()})`)

    const text = [
      `「✦」Personajes reclamados`,
      `§ Usuario: *${name}*`,
      `§ Total: *${sorted.length}*`,
      ``,
      lines.join('\n'),
      ``,
      `_Página ${page} de ${totalPages}_`,
      page < totalPages ? `_Usa \`${prefix}harem ${page + 1}\` para ver la siguiente_` : '',
    ].filter(Boolean).join('\n')

    await safeSend(() => sock.sendMessage(jid, { text, mentions: [target] }, { quoted: msg }))
  },
}

export default command
