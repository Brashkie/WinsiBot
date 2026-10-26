// #simular: cuántas veces le ganarías a la CPU de #arena según cómo juegues.
//
// La pelea de la arena no tiene atributos por jugador: los dos arrancan con
// 100 de vida y todo depende de qué acción se elige en cada turno y del azar
// de los golpes. Así que lo que sirve saber no es "¿gano?" sino "¿con qué forma
// de jugar, y cuántas veces?". Se juegan miles de peleas por Monte Carlo con
// las MISMAS reglas que la pelea real (Arena.processAction) y la misma CPU
// (elegirAccion): si se cambia un daño en pvp.ts, esto lo sabe.
//
// No frena al bot: las peleas van en tandas cortas que devuelven el control al
// event loop entre una y otra (ver simular), y hay un tope de tiempo.
//
// Lógica pura salvo eso: se prueba desde scripts/arenaSim.test.js.

import { Arena, CPU, type BattleAction, type BattleState, type NivelCpu } from './pvp.js'
import { elegirAccion, cacheDeDecisiones, type mejorAccion } from './arenaAI.js'

type Decidir = typeof mejorAccion

const JUGADOR = 'sim@arena'
/** Una pelea que no termina en esto (casi imposible) cuenta como empate. */
const MAX_TURNOS = 200

export type Estilo = 'agresivo' | 'arriesgado' | 'defensivo' | 'inteligente'
export const ESTILOS: Estilo[] = ['agresivo', 'arriesgado', 'defensivo', 'inteligente']

function nueva(nivel: NivelCpu): BattleState {
  return {
    id: 'sim', p1: JUGADOR, p2: CPU, hp1: 100, hp2: 100, shield1: 0, shield2: 0,
    turn: JUGADOR, round: 1, log: [], bet: 0, startTime: 0, lastAction: 0,
    ultimateUsed1: false, ultimateUsed2: false, cpu: nivel,
  }
}

/**
 * La pelea vista desde el jugador, como si él fuera la CPU (p2). La CPU de
 * arenaAI.ts siempre es p2; dándole el espejo, el estilo "inteligente" juega
 * con el mismo expectiminimax que ella, sin una segunda copia del algoritmo.
 */
function espejo(s: BattleState): BattleState {
  return {
    ...s, p1: JUGADOR, p2: CPU, turn: CPU,
    hp1: s.hp2, hp2: s.hp1, shield1: s.shield2, shield2: s.shield1,
    ultimateUsed1: s.ultimateUsed2, ultimateUsed2: s.ultimateUsed1, log: [],
  }
}

/** Qué hace el jugador en su turno, según el estilo. */
export function jugada(s: BattleState, estilo: Estilo, azar: () => number, decidir?: Decidir): BattleAction {
  const ult = !s.ultimateUsed1
  switch (estilo) {
    // El ultimate cuanto antes y después golpes normales, que nunca fallan.
    case 'agresivo': return ult ? 'ultimate' : 'atacar'
    // Siempre lo que más pega: el golpe poderoso falla 3 de cada 10.
    case 'arriesgado': return ult ? 'ultimate' : 'poderoso'
    // Curarse con poca vida, ponerse escudo sin escudo, y si no, atacar; el
    // ultimate para rematar.
    case 'defensivo':
      if (ult && s.hp2 <= 50) return 'ultimate'
      if (s.hp1 < 40) return 'curar'
      if (s.shield1 === 0 && s.hp1 < 75) return 'defender'
      return 'atacar'
    // El mismo cálculo que la CPU en "normal" (dos jugadas), desde su lado.
    case 'inteligente': return elegirAccion(espejo(s), 'normal', azar, decidir)
  }
}

/** Una pelea entera. Devuelve si ganó el jugador (o null, empate) y los turnos. */
type Final = { gano: boolean | null; turnos: number }

/**
 * Una pelea, turno por turno: pausa (yield) después de cada uno. Escrita una
 * sola vez para las dos formas de correrla: `pelea` la corre de un tirón, y
 * `simular` cede el event loop entre turnos cuando hace falta —contra la CPU
 * difícil una pelea entera son decenas o cientos de ms, y cediendo solo entre
 * peleas el bot quedaba frenado hasta ~600 ms seguidos—.
 */
function* turnos(nivel: NivelCpu, estilo: Estilo, azar: () => number, decidir?: Decidir): Generator<void, Final> {
  const s = nueva(nivel)
  for (let t = 0; t < MAX_TURNOS; t++) {
    const actor = s.turn
    const accion = actor === JUGADOR ? jugada(s, estilo, azar, decidir) : elegirAccion(s, nivel, azar, decidir)
    const r = Arena.processAction(s, actor, accion)
    if (r.over) return { gano: r.winner === JUGADOR, turnos: Math.ceil((t + 1) / 2) }
    yield
  }
  return { gano: null, turnos: Math.ceil(MAX_TURNOS / 2) }
}

/** Una pelea entera. Devuelve si ganó el jugador (o null, empate) y los turnos. */
export function pelea(nivel: NivelCpu, estilo: Estilo, azar: () => number = Math.random, decidir?: Decidir): Final {
  const g = turnos(nivel, estilo, azar, decidir)
  for (;;) {
    const r = g.next()
    if (r.done) return r.value
  }
}

export interface Resultado {
  estilo: Estilo
  peleas: number
  victorias: number
  /** Probabilidad de ganar, y su intervalo al 95% (Wilson). */
  p: number
  desde: number
  hasta: number
  turnosMedios: number
}

/**
 * El intervalo al 95% de una proporción, por Wilson: con pocas peleas, o con
 * 0% o 100%, el de siempre (1,96·√(p(1−p)/n)) da "±0", que es mentira. Wilson
 * da el centro corrido y un margen honesto. Devuelve [desde, hasta].
 */
export function wilson95(victorias: number, n: number): [number, number] {
  if (n <= 0) return [0, 1]
  const z = 1.96
  const p = victorias / n
  const den = 1 + (z * z) / n
  const centro = (p + (z * z) / (2 * n)) / den
  const medio = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / den
  return [Math.max(0, centro - medio), Math.min(1, centro + medio)]
}

/** Las cuentas de una simulación (de Rust o de acá) como Resultado. */
export function aResultado(c: { estilo: Estilo; peleas: number; victorias: number; turnos: number }): Resultado {
  const [desde, hasta] = wilson95(c.victorias, c.peleas)
  return { estilo: c.estilo, peleas: c.peleas, victorias: c.victorias, p: c.peleas ? c.victorias / c.peleas : 0, desde, hasta, turnosMedios: c.peleas ? c.turnos / c.peleas : 0 }
}

/** Cada cuánto, como mucho, se le devuelve el control al bot. */
const TANDA_MS = 8

/**
 * Hasta `peleas` peleas por estilo, de a una por estilo en rueda —si se corta
 * por tiempo, todos quedan con las mismas—, cediendo el event loop cada
 * TANDA_MS: contra la CPU difícil una pelea puede tardar decenas de ms, así
 * que se cede por tiempo y no por cantidad. Corta a `maxMs`; lo que se jugó,
 * se informa con su margen.
 */
export async function simular(
  nivel: NivelCpu,
  opts: { peleas?: number; maxMs?: number; azar?: () => number } = {},
): Promise<Resultado[]> {
  const { peleas = 2000, maxMs = 4000, azar = Math.random } = opts
  const inicio = Date.now()
  const decidir = cacheDeDecisiones()
  const acum = ESTILOS.map(estilo => ({ estilo, peleas: 0, victorias: 0, turnos: 0 }))
  let tanda = Date.now()
  const ceder = async () => {
    if (Date.now() - tanda < TANDA_MS) return
    await new Promise<void>(r => setImmediate(r))
    tanda = Date.now()
  }
  while (acum.some(a => a.peleas < peleas) && Date.now() - inicio < maxMs) {
    for (const a of acum) {
      if (a.peleas >= peleas) continue
      const g = turnos(nivel, a.estilo, azar, decidir)
      let r = g.next()
      while (!r.done) {
        await ceder()
        r = g.next()
      }
      a.peleas++
      if (r.value.gano) a.victorias++
      a.turnos += r.value.turnos
    }
  }
  return acum.map(aResultado)
}
