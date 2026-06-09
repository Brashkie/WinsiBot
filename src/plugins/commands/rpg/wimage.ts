import type { Command, RollCharacter } from '../../../types/index.js'
import { charCache, SOURCES, getCharacters, pickImage } from './rollwaifu.js'
import { downloadBuffer } from '@lib/downloader.js'

async function findCharacter(name: string): Promise<RollCharacter | null> {
  const needle = name.toLowerCase()

  const matches = (name: string) => {
    const n = name.toLowerCase()
    return n === needle || n.includes(needle) || needle.includes(n)
  }

  // search cached sources first
  for (const chars of charCache.values()) {
    const found = chars.find(c => matches(c.name))
    if (found) return found
  }

  // load uncached sources
  for (const source of Object.keys(SOURCES)) {
    if (charCache.has(source)) continue
    const chars = await getCharacters(source).catch(() => [] as RollCharacter[])
    const found = chars.find(c => matches(c.name))
    if (found) return found
  }

  return null
}

const command: Command = {
  name:        'wimage',
  aliases:     ['waifuimage', 'wi'],
  description: 'Muestra una imagen aleatoria de un personaje',
  category:    'rpg',
  cooldown:    5,

  async execute({ sock, jid, msg, args, prefix }) {
    const name = args.join(' ').trim()

    if (!name) {
      await sock.sendMessage(jid, {
        text: `§ Escribe el nombre del personaje.\n  Ejemplo: ${prefix}wimage Pikachu`,
      }, { quoted: msg })
      return
    }

    const char = await findCharacter(name)

    if (!char) {
      await sock.sendMessage(jid, {
        text: `✗ No se encontró el personaje *${name}*.\n  § Asegúrate de haber rodado esa fuente primero con *${prefix}rw <fuente>*`,
      }, { quoted: msg })
      return
    }

    const imageUrl = pickImage(char.image)

    let buffer: Buffer | null = null
    try {
      buffer = await downloadBuffer(imageUrl)
    } catch {}

    if (!buffer) {
      await sock.sendMessage(jid, {
        text: `✗ No se pudo descargar la imagen de *${char.name}*.`,
      }, { quoted: msg })
      return
    }

    await sock.sendMessage(jid, {
      image:   buffer,
      caption: `◈ *${char.name}* — ${char.source}`,
    }, { quoted: msg })
  },
}

export default command
