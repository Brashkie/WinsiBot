// Palabras parecidas, para sugerir un comando cuando se escribió mal (ver
// general/notfound.ts). Lógica pura: se prueba desde scripts/i18n.test.js.

/** Distancia de edición entre dos palabras cortas. */
export function distancia(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    const fila = [i]
    for (let j = 1; j <= b.length; j++) {
      fila[j] = a[i - 1] === b[j - 1] ? prev[j - 1]! : 1 + Math.min(prev[j]!, fila[j - 1]!, prev[j - 1]!)
    }
    prev = fila
  }
  return prev[b.length]!
}

/**
 * Hasta 3 claves del registro (nombres o alias) parecidas a `pedido`, una por
 * comando. Con palabras cortas se pide más parecido: a 2 letras de "rw" está
 * medio registro.
 */
export function parecidos(pedido: string, claves: Iterable<[string, { name: string }]>): string[] {
  const sin = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '')
  const p = sin(pedido)
  const max = p.length <= 4 ? 1 : 2
  const mejor = new Map<string, { clave: string; d: number }>()
  for (const [clave, cmd] of claves) {
    const d = sin(clave) === p ? 0 : distancia(p, sin(clave))
    if (d > max) continue
    const actual = mejor.get(cmd.name)
    if (!actual || d < actual.d) mejor.set(cmd.name, { clave, d })
  }
  return [...mejor.values()].sort((a, b) => a.d - b.d || a.clave.localeCompare(b.clave)).slice(0, 3).map(x => x.clave)
}
