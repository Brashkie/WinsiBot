// Que los casos guardados para el test de Rust (src/arena.rs) sigan siendo los
// que da el TypeScript. Si esto falla, se cambió una regla de la arena o de
// su CPU: `npm run build && node scripts/arena_fixture.js`, y después el test
// de Rust dice si la copia en Rust quedó atrás.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { generar } from './arena_fixture.js'
import { Arena, CPU } from '../src/lib/pvp.ts'
import { mejorAccion } from '../src/lib/arenaAI.ts'

describe('los casos de la arena para Rust', () => {
  it('el archivo guardado es el que da el TypeScript de ahora', () => {
    const guardado = JSON.parse(readFileSync(new URL('../crates/session-api/tests/fixtures/arena.json', import.meta.url), 'utf-8'))
    const ahora = generar({ Arena, CPU, mejorAccion })
    expect(ahora.acciones).toEqual(guardado.acciones)
    expect(ahora.decisiones).toEqual(guardado.decisiones)
  }, 60_000)
})
