// La CPU de `#arena cpu`: elige su acción con expectiminimax.
//
// Minimax a secas no sirve acá: el daño es aleatorio (atacar pega 8–18, el
// golpe poderoso falla 3 de cada 10). Entre cada jugada hay un nodo de AZAR,
// y lo que se compara es el valor ESPERADO. El azar se aproxima con tres
// resultados igual de probables —tirada baja, media y alta (cuantiles 0,15,
// 0,5 y 0,85)— y cada uno se simula con Arena.processAction, las mismas reglas
// de la pelea real: si mañana se cambia un daño en pvp.ts, la CPU lo sabe.
//
// La CPU maximiza, el jugador minimiza. Profundidad por nivel: fácil mira una
// jugada y a veces se equivoca a propósito, normal mira dos, difícil cuatro
// (15⁴ ≈ 50.000 hojas, unos milisegundos).

import { Arena, CPU, type BattleAction, type BattleState, type NivelCpu, type Tirada } from './pvp.js'

const ACCIONES: BattleAction[] = ['atacar', 'poderoso', 'defender', 'curar', 'ultimate']
const CUANTILES = [0.15, 0.5, 0.85]
const GANA = 1000

const PROFUNDIDAD: Record<NivelCpu, number> = { facil: 1, normal: 2, dificil: 4 }
// Fácil: a veces elige al azar, para que se le pueda ganar aprendiendo.
const ERROR: Record<NivelCpu, number> = { facil: 0.4, normal: 0.1, dificil: 0 }

const tiradaCuantil = (q: number): Tirada => (min, max) => min + Math.round(q * (max - min))

function legales(s: BattleState, esCpu: boolean): BattleAction[] {
  const usado = esCpu ? s.ultimateUsed2 : s.ultimateUsed1
  return usado ? ACCIONES.filter(a => a !== 'ultimate') : ACCIONES
}

/** Lo bien que le va a la CPU (p2), sin terminar la pelea. */
export function evaluar(s: BattleState): number {
  if (s.hp2 <= 0) return -GANA
  if (s.hp1 <= 0) return GANA
  return (s.hp2 - s.hp1)
    + 0.5 * (s.shield2 - s.shield1)
    + (s.ultimateUsed2 ? 0 : 12) - (s.ultimateUsed1 ? 0 : 12)
}

function copia(s: BattleState): BattleState {
  return { ...s, log: [] }
}

/** Valor esperado de que `actor` haga `accion` en `s`, mirando `prof` jugadas más. */
function esperado(s: BattleState, accion: BattleAction, prof: number): number {
  const actor = s.turn
  let total = 0
  for (const q of CUANTILES) {
    const h = copia(s)
    const r = Arena.processAction(h, actor, accion, tiradaCuantil(q))
    total += r.over
      // Ganar antes vale más: con la misma ventaja, rematar ya.
      ? evaluar(h) + (h.hp1 <= 0 ? prof : -prof)
      : valor(h, prof - 1)
  }
  return total / CUANTILES.length
}

/** Valores ya calculados dentro de UNA decisión (ver mejorAccion). */
let memo: Map<number, number> | null = null

function valor(s: BattleState, prof: number): number {
  if (prof <= 0 || s.hp1 <= 0 || s.hp2 <= 0) return evaluar(s)
  // La misma situación a la misma profundidad vale lo mismo: se guarda.
  const k = ((((((s.hp1 * 101 + s.hp2) * 33 + s.shield1) * 33 + s.shield2) * 2 + +s.ultimateUsed1) * 2 + +s.ultimateUsed2) * 2 + +(s.turn === CPU)) * 8 + prof
  const ya = memo?.get(k)
  if (ya !== undefined) return ya
  const r = valorSinMemo(s, prof)
  memo?.set(k, r)
  return r
}

function valorSinMemo(s: BattleState, prof: number): number {
  const esCpu = s.turn === CPU
  let mejor = esCpu ? -Infinity : Infinity
  for (const a of legales(s, esCpu)) {
    const v = esperado(s, a, prof)
    if (esCpu ? v > mejor : v < mejor) mejor = v
  }
  return mejor
}

/**
 * La mejor acción para la CPU según el cálculo, sin el error a propósito del
 * nivel fácil y normal. Depende solo del estado, así que #simular la guarda
 * (ver `cacheDeDecisiones`) y no la recalcula en cada pelea.
 */
export function mejorAccion(s: BattleState, nivel: NivelCpu): BattleAction {
  const opciones = legales(s, true)
  const prof = PROFUNDIDAD[nivel]
  let mejor = opciones[0]!
  let mejorV = -Infinity
  memo = new Map()
  try {
    for (const a of opciones) {
      const v = esperado(s, a, prof)
      if (v > mejorV) { mejorV = v; mejor = a }
    }
  } finally {
    memo = null
  }
  return mejor
}

/** La acción de la CPU en su turno. `azar()` da un número en [0, 1). `mejor`
 *  permite pasarle una `mejorAccion` guardada (#simular). */
export function elegirAccion(
  s: BattleState,
  nivel: NivelCpu,
  azar: () => number = Math.random,
  mejor: (s: BattleState, nivel: NivelCpu) => BattleAction = mejorAccion,
): BattleAction {
  const opciones = legales(s, true)
  if (azar() < ERROR[nivel]) return opciones[Math.floor(azar() * opciones.length)]!
  return mejor(s, nivel)
}

/**
 * Una `mejorAccion` que recuerda: la clave es todo lo que la decisión mira
 * (vida, escudos, ultimates, de quién es el turno). Miles de peleas simuladas
 * pasan por las mismas posiciones —todas empiezan igual—, y contra la CPU
 * difícil cada decisión son ~50.000 hojas de búsqueda.
 */
export function cacheDeDecisiones(max = 200_000): (s: BattleState, nivel: NivelCpu) => BattleAction {
  const memo = new Map<string, BattleAction>()
  return (s, nivel) => {
    const k = `${nivel}|${s.turn === CPU ? 1 : 0}|${s.hp1}|${s.hp2}|${s.shield1}|${s.shield2}|${+s.ultimateUsed1}${+s.ultimateUsed2}`
    let a = memo.get(k)
    if (a === undefined) {
      a = mejorAccion(s, nivel)
      if (memo.size < max) memo.set(k, a)
    }
    return a
  }
}
