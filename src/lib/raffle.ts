// Elegir ganadores de un sorteo. Lógica pura: la usan #sorteo y sus tests
// (scripts/raffle.test.js).
//
// Con crypto.randomInt y no Math.random: en un sorteo, que el azar sea parejo
// es todo el punto, y Math.random no promete nada sobre eso.

import { randomInt } from 'node:crypto'

/** `cuantos` distintos de `entre`, sin repetir (Fisher–Yates parcial). */
export function elegirGanadores<T>(entre: readonly T[], cuantos: number, azar: (n: number) => number = randomInt): T[] {
  const a = [...entre]
  const k = Math.min(Math.max(cuantos, 0), a.length)
  for (let i = 0; i < k; i++) {
    const j = i + azar(a.length - i)
    ;[a[i], a[j]] = [a[j]!, a[i]!]
  }
  return a.slice(0, k)
}

/** "x3" o "3x" en el texto del premio: cuántos ganadores. Devuelve el resto sin eso. */
export function cuantosGanadores(premio: string, maximo = 10): { cuantos: number; premio: string } {
  const m = premio.match(/(?:^|\s)(?:x(\d{1,2})|(\d{1,2})x)(?=\s|$)/i)
  if (!m) return { cuantos: 1, premio: premio.trim() }
  const n = Math.min(Math.max(parseInt(m[1] ?? m[2]!), 1), maximo)
  return { cuantos: n, premio: premio.replace(m[0], ' ').replace(/\s+/g, ' ').trim() }
}
