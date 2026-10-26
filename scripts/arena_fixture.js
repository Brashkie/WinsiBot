#!/usr/bin/env node
// Genera crates/session-api/tests/fixtures/arena.json: casos de la pelea de
// #arena y de su CPU, sacados del TypeScript (la referencia), para que el test
// de Rust (src/arena.rs) exija lo mismo.
//
//   npm run build && node scripts/arena_fixture.js
//
// El azar tiene semilla fija: el archivo sale siempre igual mientras no cambien
// las reglas. scripts/arena_fixture.test.js lo regenera en memoria y lo
// compara con el guardado: si se cambia una regla en pvp.ts o arenaAI.ts, ese
// test falla y dice que hay que correr esto (y después el de Rust muestra si la
// copia en Rust quedó atrás).

import { writeFileSync } from 'fs'
import { pathToFileURL } from 'url'
import { join } from 'path'

/** xorshift32 con semilla, en [0, 1). */
function semilla(s) {
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296 }
}

/** Los casos, con las funciones que se le pasen (las de dist/ o las de src/). */
export function generar({ Arena, CPU, mejorAccion }) {
  const azar = semilla(20261025)
  const entero = (a, b) => a + Math.floor(azar() * (b - a + 1))
  const estado = (cpu) => ({
    id: 'f', p1: 'p', p2: CPU, turn: cpu ? CPU : 'p', round: 1, log: [], bet: 0, startTime: 0, lastAction: 0,
    hp1: entero(1, 100), hp2: entero(1, 100), shield1: entero(0, 16), shield2: entero(0, 16),
    ultimateUsed1: azar() < 0.4, ultimateUsed2: azar() < 0.4,
  })
  const plano = (s) => ({ hp1: s.hp1, hp2: s.hp2, shield1: s.shield1, shield2: s.shield2, ultimateUsed1: s.ultimateUsed1, ultimateUsed2: s.ultimateUsed2, cpu: s.turn === CPU })

  const ACC = ['atacar', 'poderoso', 'defender', 'curar', 'ultimate']
  const acciones = []
  for (let i = 0; i < 1500; i++) {
    const s = estado(azar() < 0.5)
    const antes = plano(s)
    const accion = ACC[entero(0, 4)]
    const tiradas = []
    const r = Arena.processAction(s, s.turn, accion, (a, b) => { const v = entero(a, b); tiradas.push(v); return v })
    acciones.push({ antes, accion, tiradas, despues: plano(s), fin: r.over })
  }

  const decisiones = []
  for (const [nivel, n] of [['facil', 200], ['normal', 200], ['dificil', 100]]) {
    for (let i = 0; i < n; i++) {
      const s = estado(true)
      decisiones.push({ estado: plano(s), nivel, accion: mejorAccion(s, nivel) })
    }
  }
  return { acciones, decisiones }
}

// Corrido directo: escribe el archivo desde dist/.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dist = (p) => pathToFileURL(join(process.cwd(), 'dist', p)).href
  const pvp = await import(dist('lib/pvp.js'))
  const ai = await import(dist('lib/arenaAI.js'))
  const datos = generar({ Arena: pvp.Arena, CPU: pvp.CPU, mejorAccion: ai.mejorAccion })
  const destino = join(process.cwd(), 'crates', 'session-api', 'tests', 'fixtures', 'arena.json')
  writeFileSync(destino, JSON.stringify(datos))
  console.log(`  ✔ ${datos.acciones.length} acciones y ${datos.decisiones.length} decisiones → ${destino}`)
  process.exit(0)
}
