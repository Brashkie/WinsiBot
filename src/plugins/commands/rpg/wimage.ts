import type { Command, RollCharacter } from '../../../types/index.js'
import { SOURCES, getCharacters, pickImage } from './rollwaifu.js'
import { downloadBuffer } from '@lib/downloader.js'
import { translate } from '@vitalets/google-translate-api'

/** Normaliza: minúsculas, sin acentos, sin guiones/espacios extra. */
const norm = (s: string) =>
  s.toLowerCase()
   .normalize('NFD').replace(/[̀-ͯ]/g, '')
   .replace(/[-_\s]+/g, '')

function findBest(chars: RollCharacter[], needle: string): RollCharacter | null {
  const n = norm(needle)

  const score = (charName: string): number => {
    const c = norm(charName)
    if (c === n)                          return 4  // exacto normalizado
    if (c.startsWith(n) || n.startsWith(c)) return 3  // prefijo
    if (c.includes(n)   || n.includes(c))   return 2  // parcial
    // palabra a palabra: al menos una palabra en común
    const nWords = n.split('')   // ya sin espacios, busca por tokens
    const cWords = c.split('')
    void nWords; void cWords
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

/**
 * Busca en TODAS las fuentes de GitHub.
 * Si no encuentra con la query original, traduce al inglés y reintenta.
 */
async function findCharacter(name: string): Promise<{ char: RollCharacter; total: number } | null> {
  const allChars = (
    await Promise.all(Object.keys(SOURCES).map(s => getCharacters(s).catch(() => [])))
  ).flat()

  // 1. Buscar con query original
  const direct = findBest(allChars, name)
  if (direct) return { char: direct, total: allChars.length }

  // 2. Traducir al inglés y reintentar (ej: "hombre araña" → "spider man")
  try {
    const { text: enQuery } = await translate(name, { to: 'en' })
    if (norm(enQuery) !== norm(name)) {
      const translated = findBest(allChars, enQuery)
      if (translated) return { char: translated, total: allChars.length }
    }
  } catch { /* si la traducción falla, continúa */ }

  return null
}

const command: Command = {
  name:        'wimage',
  aliases:     ['waifuimage', 'wi', 'charimage'],
  description: 'Imagen de personaje  |  !wi random — aleatorio  |  !wi <nombre>',
  category:    'rpg',
  cooldown:    5,

  async execute({ sock, jid, msg, args, prefix }) {
    const query = args.join(' ').trim().toLowerCase()
    const isRandom = !query || query === 'random' || query === 'aleatorio'

    const allChars = (
      await Promise.all(Object.keys(SOURCES).map(s => getCharacters(s).catch(() => [])))
    ).flat()

    if (allChars.length === 0) {
      await sock.sendMessage(jid, {
        text: `✗ No se pudieron cargar los personajes (error de red). Reintenta en unos segundos.`,
      }, { quoted: msg })
      return
    }

    let char: typeof allChars[0] | null = null

    if (isRandom) {
      char = allChars[Math.floor(Math.random() * allChars.length)]!
    } else {
      const result = await findCharacter(query)
      if (!result) {
        await sock.sendMessage(jid, {
          text: [
            `✗ No se encontró *${args.join(' ')}* (${allChars.length} personajes disponibles)`,
            ``,
            `§ Intenta con el nombre en inglés`,
            `§ Usa *${prefix}wi random* para uno aleatorio`,
          ].join('\n'),
        }, { quoted: msg })
        return
      }
      char = result.char
    }

    const imageUrl = pickImage(char.image)
    let buffer: Buffer | null = null
    try { buffer = await downloadBuffer(imageUrl) } catch {}

    if (!buffer) {
      await sock.sendMessage(jid, {
        text: `✗ No se pudo descargar la imagen de *${char.name}*. Reintenta.`,
      }, { quoted: msg })
      return
    }

    const sourceLabel = char.source
      ? `_${char.source}_`
      : `_Fuente desconocida_`

    await sock.sendMessage(jid, {
      image:   buffer,
      caption: [
        `◈ *${char.name}*`,
        sourceLabel,
        isRandom ? `_#${allChars.indexOf(char) + 1} de ${allChars.length}_` : '',
      ].filter(Boolean).join('\n'),
    }, { quoted: msg })
  },
}

export default command
