// Cortar texto al ancho de la terminal, barato, para lo que se imprime por
// cada mensaje.
//
// ansimax lo hace exacto —`truncateAnsi` segmenta grafemas y entiende ANSI—,
// pero medido cuesta ~290 µs por línea (y `visibleLen` ~22 µs): para una
// línea por mensaje es más que todo el resto del handler. Acá solo se corta el
// pedazo que varía (el texto del mensaje, un nombre), que no trae ANSI, y el
// ancho de cada carácter se estima por rangos: los emojis y los ideogramas
// ocupan dos columnas, los combinantes ninguna, el resto una. Se puede pasar
// por una columna con un emoji raro; nunca se parte una línea en dos.
//
// Lógica pura: se prueba desde scripts/terminal.test.js.

/** Columnas que ocupa un punto de código, estimadas por rangos. */
function columnas(cp: number): number {
  if (cp < 0x300) return cp < 0x20 ? 0 : 1
  if (cp <= 0x36f || (cp >= 0x200b && cp <= 0x200f) || cp === 0xfe0f || cp === 0x200d) return 0
  if (
    (cp >= 0x1100 && cp <= 0x115f) || (cp >= 0x2e80 && cp <= 0xa4cf) || (cp >= 0xac00 && cp <= 0xd7a3) ||
    (cp >= 0xf900 && cp <= 0xfaff) || (cp >= 0xfe30 && cp <= 0xfe4f) || (cp >= 0xff00 && cp <= 0xff60) ||
    (cp >= 0xffe0 && cp <= 0xffe6) || (cp >= 0x1f000 && cp <= 0x1faff) || (cp >= 0x2600 && cp <= 0x27bf) ||
    (cp >= 0x20000 && cp <= 0x3fffd)
  ) return 2
  return 1
}

/** Columnas que ocupa `s` (sin ANSI). */
export function anchoTexto(s: string): number {
  let n = 0
  for (const ch of s) n += columnas(ch.codePointAt(0)!)
  return n
}

/** `s` (sin ANSI) cortado a `max` columnas, con "…" si no entraba. Los saltos
 *  de línea pasan a espacios: un mensaje de varias líneas es un renglón. */
export function cortar(s: string, max: number): string {
  if (max <= 0) return ''
  let n = 0
  let out = ''
  for (const ch of s) {
    const c = ch === '\n' || ch === '\r' || ch === '\t' ? ' ' : ch
    const w = columnas(c.codePointAt(0)!)
    if (n + w > max) {
      // Lugar para el "…": se saca lo necesario del final.
      while (out && n + 1 > max) {
        const ult = [...out].pop()!
        out = out.slice(0, out.length - ult.length)
        n -= columnas(ult.codePointAt(0)!)
      }
      return out + '…'
    }
    out += c
    n += w
  }
  return out
}

/** El ancho de la terminal, o 80 si no es una (un log, un pipe). */
export const anchoTerminal = (): number => process.stdout.columns || 80
