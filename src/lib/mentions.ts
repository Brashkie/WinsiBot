// Las menciones que el bot repite.
//
// WhatsApp guarda una mención como "@<número>" en el texto —en grupos con @lid,
// "@160305996898368"— y muestra el nombre solo si el mensaje trae, aparte, la
// lista de mencionados (`mentions`). Muchos comandos repiten texto del usuario
// (una razón de #afk, un #say, una descripción) sin esa lista, y en el chat
// salía el número crudo.
//
// Acá se anota, de cada mensaje que llega, qué jid completo es cada mención
// (`anotar`), y al enviar se completa la lista con los "@<número>" del texto
// que se conozcan (`completar`, desde core/egress.ts). Solo se agregan
// menciones de alguien que ya fue mencionado: el bot no inventa ninguna.
//
// Lógica pura: se prueba desde scripts/mentions.test.js.

/** "160305996898368" → "160305996898368@lid", de lo que se vio llegar. */
const conocidos = new Map<string, string>()
const MAX = 5_000

const usuario = (jid: string) => (jid.split('@')[0] ?? '').split(':')[0] ?? ''

/** Anota los jids que trajo un mensaje (sus menciones, quien lo mandó). */
export function anotar(jids: readonly (string | null | undefined)[]): void {
  for (const j of jids) {
    if (!j?.includes('@')) continue
    const u = usuario(j)
    if (!/^\d{5,}$/.test(u)) continue
    // El más reciente al final, para descartar los más viejos.
    conocidos.delete(u)
    conocidos.set(u, j.replace(/:\d+@/, '@'))
  }
  while (conocidos.size > MAX) {
    const viejo = conocidos.keys().next().value
    if (viejo === undefined) break
    conocidos.delete(viejo)
  }
}

/** Los jids de los "@<número>" de `texto` que se conocen. */
export function mencionesDe(texto: string): string[] {
  const out: string[] = []
  for (const m of texto.matchAll(/@(\d{5,})/g)) {
    const j = conocidos.get(m[1] ?? '')
    if (j && !out.includes(j)) out.push(j)
  }
  return out
}

/**
 * El contenido de un envío con su lista de menciones completa. Devuelve el
 * mismo objeto si no hay nada que agregar.
 */
export function completar<T>(content: T): T {
  if (!content || typeof content !== 'object') return content
  const c = content as { text?: unknown; caption?: unknown; mentions?: string[] }
  const texto = typeof c.text === 'string' ? c.text : typeof c.caption === 'string' ? c.caption : ''
  if (!texto.includes('@')) return content
  const ya = c.mentions ?? []
  const faltan = mencionesDe(texto).filter((j) => !ya.includes(j))
  if (!faltan.length) return content
  return { ...content, mentions: [...ya, ...faltan] }
}

/** Para los tests. */
export function olvidarTodo(): void {
  conocidos.clear()
}
