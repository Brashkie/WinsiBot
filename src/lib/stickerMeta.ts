// Leer el pack y el autor que alguien escribe para un sticker. Lógica pura:
// se prueba desde scripts/stickers.test.js.

/**
 * "Mi pack | Yo" → { pack, author }. Lo que falta sale de `base`. Con el `|`
 * los nombres pueden tener espacios; antes se separaba por espacios y
 * `#sticker Mi Pack` dejaba "Mi" de pack y "Pack" de autor.
 */
export function leerMeta(texto: string, base: { pack: string; author: string }): { pack: string; author: string } {
  const t = texto.trim()
  if (!t) return base
  const [pack, ...resto] = t.split('|')
  const author = resto.join('|').trim()
  return { pack: pack!.trim().slice(0, 60) || base.pack, author: author.slice(0, 60) || base.author }
}
