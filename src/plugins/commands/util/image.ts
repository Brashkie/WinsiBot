import type { Command } from '../../../types/index.js'
import { pythonPost } from '@lib/pythonBridge.js'

const BANNED_WORDS = [
  'porn','porno','xxx','nsfw','hentai','nude','nudes',
  'polla','pene','vagina','culo','teta','coño','puta',
  'sexo','sex','gore','semen','cum','anal','blowjob',
  'ahegao','ecchi','yuri','rule34','furry','bdsm',
  'pedofilia','necrofilia','cp','violacion','zoofilia',
  'verga','pinga','chocha','cuca','panocha',
  'xvideos','xnxx','pornhub','onlyfans',
]

function hasBannedWord(text: string): boolean {
  const l = text.toLowerCase()
  return BANNED_WORDS.some(w => l.includes(w))
}

const command: Command = {
  name:        'imagen',
  aliases:     ['img', 'image', 'gimage', 'jpg', 'buscarimg'],
  description: 'Busca una imagen en internet',
  category:    'util',
  cooldown:    10,

  async execute({ sock, jid, msg, args, prefix, command: cmd }) {
    const query = args.join(' ').trim()

    if (!query) {
      await sock.sendMessage(jid, {
        text: [
          `✗ Ingresa algo que buscar.`,
          ``,
          `  Uso: ${prefix}${cmd} <busqueda>`,
          `  Ejemplo: ${prefix}${cmd} perros graciosos`,
        ].join('\n'),
      }, { quoted: msg })
      return
    }

    if (hasBannedWord(query)) {
      await sock.sendMessage(jid, {
        text: `✗ No busques cochinadas 😬`,
      }, { quoted: msg })
      return
    }

    const sent = await sock.sendMessage(jid, {
      text: `◈ Buscando: *${query}*...`,
    }, { quoted: msg })
    const key = sent?.key

    const edit = (t: string) =>
      sock.sendMessage(jid, { text: t, edit: key } as any).catch(() => {})

    await new Promise(r => setTimeout(r, 400))
    await edit('◈◈ Buscando y descargando...')

    // Búsqueda + descarga en un solo viaje — python/ml/search.py ya maneja
    // el fallback DDG → Bing y reintenta con varias URLs hasta que una baje.
    // Timeout largo: puede tardar (búsqueda + hasta 5 intentos de descarga).
    const res = await pythonPost<{
      image:  string   // base64 JPEG
      width:  number
      height: number
    }>('/api/v1/search/image', { query }, 30_000)

    if (!res.success || !res.data?.image) {
      await edit(`✗ No se encontraron imágenes para: *${query}*`)
      return
    }

    const buffer = Buffer.from(res.data.image, 'base64')

    await edit(`✔ ¡Listo!`)
    await new Promise(r => setTimeout(r, 150))

    await sock.sendMessage(jid, {
      image:   buffer,
      caption: `◆ *${query}*`,
    }, { quoted: msg })
  },
}

export default command
