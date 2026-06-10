import type { Command, RollCharacter } from '../../../types/index.js'
import { SOURCES, getCharacters, inventory } from './rollwaifu.js'
import { translate } from '@vitalets/google-translate-api'
import { userData } from '@core/events/index.js'

const norm = (s: string) =>
  s.toLowerCase()
   .normalize('NFD').replace(/[̀-ͯ]/g, '')
   .replace(/[-_\s]+/g, '')

function findBest(chars: RollCharacter[], needle: string): RollCharacter | null {
  const n = norm(needle)
  const score = (charName: string): number => {
    const c = norm(charName)
    if (c === n)                            return 4
    if (c.startsWith(n) || n.startsWith(c)) return 3
    if (c.includes(n)   || n.includes(c))   return 2
    return 0
  }
  let best: RollCharacter | null = null
  let bestScore = 0
  for (const char of chars) {
    const s = score(char.name)
    if (s > bestScore) { best = char; bestScore = s }
    if (bestScore === 4) break
  }
  return bestScore > 0 ? best : null
}

async function findCharacter(name: string): Promise<RollCharacter | null> {
  const allChars = (
    await Promise.all(Object.keys(SOURCES).map(s => getCharacters(s).catch(() => [])))
  ).flat()

  const direct = findBest(allChars, name)
  if (direct) return direct

  try {
    const { text: enQuery } = await translate(name, { to: 'en' })
    if (norm(enQuery) !== norm(name)) {
      const translated = findBest(allChars, enQuery)
      if (translated) return translated
    }
  } catch { /* ignora si la traducción falla */ }

  return null
}

interface OwnerInfo { jid: string; char: RollCharacter }

function findOwner(charName: string): OwnerInfo | null {
  const needle = charName.toLowerCase()
  for (const [jid, chars] of inventory.entries()) {
    const char = chars.find(c => c.name.toLowerCase() === needle)
    if (char) return { jid, char }
  }
  return null
}

function ownerName(jid: string): string {
  return userData.get(jid)?.name || jid.replace(/@s\.whatsapp\.net|@lid/g, '').replace(/[^0-9]/g, '')
}

function dateES(ts: number): string {
  return new Intl.DateTimeFormat('es', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  }).format(new Date(ts))
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts
  const s = Math.floor(diff / 1000)
  const m = Math.floor(s / 60)
  const h = Math.floor(m / 60)
  const d = Math.floor(h / 24)
  if (d > 0) return `hace ${d}d ${h % 24}h ${m % 60}m ${s % 60}s`
  if (h > 0) return `hace ${h}h ${m % 60}m ${s % 60}s`
  if (m > 0) return `hace ${m}m ${s % 60}s`
  return `hace ${s}s`
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
        text: `✗ No se encontró *${name}* en ninguna fuente.\n  § Fuentes: ${Object.keys(SOURCES).join(', ')}`,
      }, { quoted: msg })
      return
    }

    const owner    = findOwner(char.name)
    const mentions = owner ? [owner.jid] : []

    const estadoStr = owner
      ? `Reclamado por ${ownerName(owner.jid)}`
      : (char.status ?? 'Libre')

    const lines = [
      `◈ *${char.name}*`,
      ``,
      `  ⚥ Género     ⇝ *${char.gender}*`,
      `  ☆ Valor      ⇝ *${char.value}*`,
      `  ♡ Estado     ⇝ *${estadoStr}*`,
      owner?.char.claimedAt
        ? `  📅 Reclamo   ⇝ ${dateES(owner.char.claimedAt)}`
        : '',
      `  ◆ Fuente     ⇝ *${char.source}*`,
      `  □ Puesto     ⇝ *#${char.id}*`,
      char.votes
        ? `  ★ Últ. voto ⇝ ${timeAgo(char.votes)}`
        : '',
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
