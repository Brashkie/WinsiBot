// #ship: la compatibilidad entre dos personas. Lógica pura, probada en
// scripts/ship.test.js.
//
// El porcentaje sale de un hash de la PAREJA, no del azar: la misma pareja da
// siempre lo mismo, en cualquier orden. Si saliera al azar, la gente lo
// repetiría hasta que diera 100 y el número no significaría nada.

/** FNV-1a de 32 bits, con una mezcla final para repartir bien los bits bajos. */
function hash(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  h ^= h >>> 16
  h = Math.imul(h, 0x85ebca6b)
  h ^= h >>> 13
  return h >>> 0
}

const soloNumero = (jid: string) => jid.split('@')[0]!.split(':')[0]!

/** 0 a 100, igual para (a, b) que para (b, a). Uno consigo mismo: 100. */
export function compatibilidad(a: string, b: string): number {
  const [x, y] = [soloNumero(a), soloNumero(b)].sort()
  if (x === y) return 100
  return hash(`${x}|${y}|winsi-ship`) % 101
}

export function veredicto(p: number): string {
  if (p >= 95) return '💍 Almas gemelas. Que vayan pensando en la boda.'
  if (p >= 80) return '💘 Hay química de la buena.'
  if (p >= 60) return '💕 Tienen futuro, si alguno se anima.'
  if (p >= 40) return '🙂 Amigos con potencial… o solo amigos.'
  if (p >= 20) return '😬 Mejor como compañeros de grupo.'
  return '💔 Ni el destino puede con esto.'
}

/** El nombre de la pareja: la primera mitad de uno y la segunda del otro. */
export function nombreDePareja(a: string, b: string): string {
  const limpio = (s: string) => s.replace(/[^\p{L}]/gu, '') || s
  const x = limpio(a)
  const y = limpio(b)
  const mitadA = x.slice(0, Math.max(1, Math.ceil(x.length / 2)))
  const mitadB = y.slice(Math.floor(y.length / 2))
  const r = (mitadA + mitadB).toLowerCase()
  return r.charAt(0).toUpperCase() + r.slice(1)
}

export function barra(p: number, largo = 10): string {
  const llenos = Math.round((p / 100) * largo)
  return '❤️'.repeat(llenos) + '🤍'.repeat(largo - llenos)
}
