// El compañero: el dragón que te acompaña. Gana experiencia con tu actividad
// en el chat y es el que pelea a tu lado en #raid (su nivel da daño y sus
// elementos pueden dar una reacción con el de otro jugador, ver raid.ts).
//
// Se elige con `#pet companero <#>`; si no se eligió, es el de nivel más alto,
// que es el que ya usaba el raid. Se recuerda por `hatchedAt` y no por su
// número en la lista, porque el número cambia al liberar o subastar otro.
//
// La experiencia por actividad tiene freno, o mandar spam sería la forma de
// subir dragones: un poco por mensaje, con espera entre uno y otro y un tope
// por día. Y NO lo hace evolucionar a su forma final: eso se queda en
// alimentarlo, que es cuando se muestra el video de la evolución.
//
// Lógica pura: la llama addXP (events/xp.ts) por cada mensaje, y se prueba
// desde scripts/companero.test.js.

import type { OwnedDragon, UserData } from '@core/events.js'
import { aplicarExp, STAGE3_LEVEL } from './dragonNivel.js'

export const EXP_POR_MSG = 2
export const ESPERA      = 30_000
export const TOPE_DIA    = 120   // unos 30 min de charla espaciada; una alimentada da 30

type ConDragones = Pick<UserData, 'dragons' | 'companero' | 'petActividad'>

export function companeroDe(u: ConDragones): OwnedDragon | undefined {
  if (!u.dragons.length) return undefined
  const elegido = u.companero !== undefined ? u.dragons.find(d => d.hatchedAt === u.companero) : undefined
  return elegido ?? u.dragons.reduce((m, d) => (d.level > m.level ? d : m))
}

export const esCompanero = (u: ConDragones, d: OwnedDragon) => companeroDe(u) === d

const diaDe = (ms: number) => new Date(ms).toISOString().slice(0, 10)

export function ganadoHoy(u: ConDragones, ahora = Date.now()): number {
  return u.petActividad?.dia === diaDe(ahora) ? u.petActividad.exp : 0
}

/** Un mensaje del dueño. Modifica `u` y su compañero; devuelve la exp ganada. */
export function porMensaje(u: ConDragones, ahora: number): number {
  const d = companeroDe(u)
  if (!d) return 0
  const dia = diaDe(ahora)
  const act = u.petActividad?.dia === dia ? u.petActividad : { dia, exp: 0, ultimo: 0 }
  if (ahora - act.ultimo < ESPERA || act.exp >= TOPE_DIA) return 0

  const gana = Math.min(EXP_POR_MSG, TOPE_DIA - act.exp)
  // Uno que todavía no evolucionó se queda a un nivel de hacerlo.
  aplicarExp(d, gana, d.stage === 3 ? Infinity : STAGE3_LEVEL - 1)
  u.petActividad = { dia, exp: act.exp + gana, ultimo: ahora }
  return gana
}
