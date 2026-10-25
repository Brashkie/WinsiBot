import type { Command } from '../../../types/index.js'
import { commandRegistry } from '../index.js'
import { sendWithMedia } from '@lib/media_sender.js'
import { config } from '@config'
import { CATEGORY_SYMBOLS } from './categorySymbols.js'
import { t, nombreCategoria, aliasesPara } from '@lib/i18n.js'
import { descripcion } from '@lib/i18nDescriptions.js'

/** Comandos únicos: el registro indexa nombre + alias, se deduplica por nombre. */
const unique0 = () => [...new Map([...commandRegistry.values()].map(c => [c.name, c])).values()]

const command: Command = {
  name: 'categoria',
  aliases: ['cat', 'category'],
  description: 'Muestra comandos de una categoria especifica',
  category: 'general',

  async execute({ sock, jid, msg, args, prefix, lang }) {
    // Se puede pedir por el nombre que se ve en el menú (#categoria diversión,
    // #category fun, #categoria figurinhas) además del id.
    const pedido = args[0]?.toLowerCase()
    const ids = [...new Set(unique0().map(c => c.category))]
    const cat = pedido && (ids.find(id => id === pedido)
      ?? ids.find(id => (['es', 'en', 'pt'] as const).some(l => nombreCategoria(id, l).toLowerCase() === pedido)))
      || pedido

    const unique = unique0()

    // sin argumento — mostrar lista de categorias
    if (!cat) {
      const categories = [...new Set(unique.map(c => c.category))]

      const rows = categories.map(c => {
        const count  = unique.filter(cmd => cmd.category === c).length
        const symbol = CATEGORY_SYMBOLS[c] ?? '·'
        return `> ${symbol} *${nombreCategoria(c, lang)}* — ${count} ${t(lang, 'menu.comandos')}`
      })

      const text = [
        `◈ *${config.botName} — ${t(lang, 'cat.titulo')}*`,
        ``,
        ...rows,
        ``,
        t(lang, 'cat.usar', { p: prefix }),
      ].join('\n')

      await sendWithMedia(sock, jid, text, 'menu', msg)
      return
    }

    // con argumento — mostrar comandos de esa categoria
    const cmds = unique.filter(c => c.category === cat)

    if (!cmds.length) {
      await sock.sendMessage(jid, {
        text: t(lang, 'cat.noExiste', { cat, p: prefix }),
      }, { quoted: msg })
      return
    }

    const symbol = CATEGORY_SYMBOLS[cat] ?? '·'

    const rows = cmds.map(cmd => {
      const lista = aliasesPara(cmd, lang)
      const aliases = lista.length
        ? `  (${lista.map(a => `${prefix}${a}`).join(', ')})`
        : ''
      return `> *${prefix}${cmd.name}*${aliases} — ${descripcion(cmd, lang)}`
    })

    const text = [
      `${symbol} *${nombreCategoria(cat, lang)}* — ${cmds.length} ${t(lang, 'menu.comandos')}`,
      ``,
      ...rows,
    ].join('\n')

    await sendWithMedia(sock, jid, text, cat, msg)
  },
}

export default command