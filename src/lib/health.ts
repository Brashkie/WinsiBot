// La salud del jugador (0-100). Baja cuando el jefe del raid contraataca, se
// recupera sola con el tiempo, y se puede curar antes con una poción (las que
// da #daily) o pagando en el hospital.
//
// La regeneración es perezosa: no hay temporizador que sume puntos a 2557
// usuarios. Se guarda la salud y el momento al que corresponde (`saludAt`), y
// la de ahora se calcula al mirarla. Los minutos que sobran de un punto se
// conservan al cambiarla, para que pegar o curar no reinicie la cuenta.
//
// Lógica pura: se prueba desde scripts/health.test.js.

import type { UserData } from '@core/events.js'

export const MAX = 100
/** Un punto cada 3 minutos: de 0 a 100 en 5 horas. */
export const REGEN_MS = 3 * 60_000
/** Con menos, no se pelea: hay que esperar o curarse. */
export const MIN_PELEAR = 20
/** Lo que cura una poción. */
export const POCION = 40

type ConSalud = Pick<UserData, 'health' | 'saludAt' | 'level'>

/** La salud de ahora, con lo regenerado desde la última vez. */
export function saludDe(u: Pick<UserData, 'health' | 'saludAt'>, ahora = Date.now()): number {
  const h = Math.min(Math.max(u.health ?? MAX, 0), MAX)
  if (h >= MAX || !u.saludAt) return h
  return Math.min(MAX, h + Math.floor(Math.max(0, ahora - u.saludAt) / REGEN_MS))
}

/** Fija la salud en `valor` sin perder el pedazo de punto que ya se regeneró. */
function fijar(u: Pick<UserData, 'health' | 'saludAt'>, valor: number, ahora: number): number {
  const sobra = u.saludAt ? Math.max(0, ahora - u.saludAt) % REGEN_MS : 0
  u.health = Math.min(Math.max(Math.round(valor), 0), MAX)
  if (u.health >= MAX) delete u.saludAt
  else u.saludAt = ahora - sobra
  return u.health
}

/** Resta `n` puntos. Devuelve la salud que queda. */
export function herir(u: Pick<UserData, 'health' | 'saludAt'>, n: number, ahora = Date.now()): number {
  return fijar(u, saludDe(u, ahora) - Math.max(0, n), ahora)
}

/** Suma `n` puntos, hasta el máximo. Devuelve la salud que queda. */
export function curar(u: Pick<UserData, 'health' | 'saludAt'>, n: number, ahora = Date.now()): number {
  return fijar(u, saludDe(u, ahora) + Math.max(0, n), ahora)
}

/** Cuánto falta para volver a `objetivo` esperando. */
export function esperaHasta(u: Pick<UserData, 'health' | 'saludAt'>, objetivo: number, ahora = Date.now()): number {
  const h = saludDe(u, ahora)
  if (h >= objetivo) return 0
  const sobra = u.saludAt ? Math.max(0, ahora - u.saludAt) % REGEN_MS : 0
  return (objetivo - h) * REGEN_MS - sobra
}

/**
 * Lo que cobra el hospital por llenar la salud. Sube con el nivel, como lo que
 * se gana: a nivel 10, curar de 0 a 100 cuesta ¥3.000, una media hora de #work.
 * Esperar es gratis; pagar es por no esperar.
 */
export function costoHospital(u: ConSalud, ahora = Date.now()): number {
  const faltan = MAX - saludDe(u, ahora)
  return faltan * (10 + 2 * Math.max(u.level ?? 0, 0))
}
