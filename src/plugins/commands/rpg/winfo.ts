import type { Command, RollCharacter } from '../../../types/index.js'
import { charCache, SOURCES, getCharacters, inventory } from './rollwaifu.js'

async function findCharacter(name: string): Promise<RollCharacter | null> {
  const needle = name.toLowerCase()

  for (const chars of charCache.values()) {
    const found = chars.find(c => c.name.toLowerCase() === needle)
    if (found) return found
  }

  for (const source of Object.keys(SOURCES)) {
    if (charCache.has(source)) continue
    const chars = await getCharacters(source).catch(() => [] as RollCharacter[])
    const found = chars.find(c => c.name.toLowerCase() === needle)
    if (found) return found
  }

  return null
}

function findOwner(charName: string): string | null {
  const needle = charName.toLowerCase()
  for (const [jid, chars] of inventory.entries()) {
    if (chars.some(c => c.name.toLowerCase() === needle)) return jid
  }
  return null
}

function num(jid: string): string {
  return jid.replace(/@s\.whatsapp\.net|@lid/g, '').replace(/[^0-9]/g, '')
}

const command: Command = {
  name:        'winfo',
  aliases:     ['waifuinfo', 'charinfo'],
  description: 'Muestra información de un personaje',
  category:    'rpg',
  cooldown:    5,

  async execute({ sock, jid, msg, args, prefix }) {
    const name = args.join(' ').trim()

    if (!name) {
      await sock.sendMessage(jid, {
        text: `§ Escribe el nombre del personaje.\n  Ejemplo: ${prefix}winfo Pikachu`,
      }, { quoted: msg })
      return
    }

    const char = await findCharacter(name)

    if (!char) {
      await sock.sendMessage(jid, {
        text: `✗ No se encontró el personaje *${name}*.\n  § Usa *${prefix}rw <fuente>* para cargar personajes primero.`,
      }, { quoted: msg })
      return
    }

    const ownerJid = findOwner(char.name)
    const ownerStr = ownerJid ? `@${num(ownerJid)}` : 'Nadie'
    const mentions = ownerJid ? [ownerJid] : []

    const lines = [
      `◈ *${char.name}*`,
      ``,
      `  ⚥ Genero    ⇝ *${char.gender}*`,
      `  ☆ Valor     ⇝ *${char.value}*`,
      `  ♡ Estado    ⇝ *${char.status}*`,
      `  ◆ Fuente    ⇝ *${char.source}*`,
      `  ♛ Dueño     ⇝ *${ownerStr}*`,
      char.habilidad ? `  ⚡ Habilidad ⇝ ${char.habilidad}` : '',
      char.debilidad ? `  ✦ Debilidad ⇝ ${char.debilidad}` : '',
    ].filter(Boolean)

    await sock.sendMessage(jid, {
      text:     lines.join('\n'),
      mentions,
    }, { quoted: msg })
  },
}

export default command
