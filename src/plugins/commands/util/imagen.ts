import type { Command } from '../../../types/index.js'
import { pythonPost } from '@lib/pythonBridge.js'

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

// ─── palabras prohibidas ──────────────────────────────────────────────────────
const BANNED_WORDS = [
  'porn', 'porno', 'xxx', 'nsfw', 'hentai', 'nude', 'nudes',
  'polla', 'pene', 'vagina', 'culo', 'teta', 'coño', 'puta',
  'sexo', 'sex', 'gore', 'semen', 'cum', 'anal', 'blowjob',
  'ahegao', 'ecchi', 'yuri', 'rule34', 'furry', 'bdsm',
  'pedofilia', 'necrofilia', 'cp', 'violacion', 'zoofilia',
  'verga', 'pinga', 'chocha', 'cuca', 'panocha',
  'xvideos', 'xnxx', 'pornhub', 'onlyfans',
]

function hasBannedWord(text: string): boolean {
  const lower = text.toLowerCase()
  return BANNED_WORDS.some(w => lower.includes(w))
}

const command: Command = {
  name: 'imagen',
  aliases: ['img', 'image', 'gimage', 'jpg', 'buscarimg'],
  description: 'Busca una imagen en internet',
  category: 'util',
  cooldown: 10,

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

    // filtro de contenido
    if (hasBannedWord(query)) {
      await sock.sendMessage(jid, {
        text: `✗ No busques cochinadas, aprovecha el tiempo en algo mejor 😬`,
      }, { quoted: msg })
      return
    }

    // animacion
    const sent = await sock.sendMessage(jid, {
      text: `◈ Buscando: *${query}*...`,
    }, { quoted: msg })
    const key = sent?.key

    const frames = [
      '◈◈ Buscando en internet...',
      '◈◈◈ Encontrando imagen...',
      '◈◈ Descargando...',
    ]

    const [result] = await Promise.all([
      pythonPost<{
        success: boolean
        image?:  string
        error?:  string
        query?:  string
        total?:  number
        width?:  number
        height?: number
      }>('/api/v1/search/image', { query })
        .catch(() => null),
      (async () => {
        for (const frame of frames) {
          await sleep(600)
          await sock.sendMessage(jid, { text: frame, edit: key } as any)
        }
      })(),
    ])

    if (!result?.data?.success || !result.data.image) {
      await sock.sendMessage(jid, {
        text: `✗ No se encontraron imagenes para: *${query}*`,
        edit: key,
      } as any)
      return
    }

    await sock.sendMessage(jid, { text: '✔ Listo', edit: key } as any)
    await sleep(200)

    const buffer  = Buffer.from(result.data.image, 'base64')
    const caption = [
      `◆ ${result.data.query ?? query}`,
      result.data.total ? `§ ${result.data.total} resultados encontrados` : '',
      result.data.width && result.data.height
        ? `§ ${result.data.width}x${result.data.height}px`
        : '',
    ].filter(Boolean).join('\n')

    await sock.sendMessage(jid, {
      image:   buffer,
      caption,
    }, { quoted: msg })
  },
}

export default command