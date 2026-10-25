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
// desde scripts/companion.test.js.

import type { OwnedDragon, UserData } from '@core/events.js'
import { aplicarExp, STAGE3_LEVEL } from './dragonLevel.js'

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

// ─── Cuidados ─────────────────────────────────────────────────────────────────
// Darle de comer, de beber y sacarlo a pasear. Cada cuidado dura unas horas; si
// están al día, el compañero pelea mejor en #raid —pega más y te cubre del
// contraataque del jefe—. Descuidarlo no castiga: solo deja de dar el bono.
//
// Se guardan en el usuario y no en el dragón: cambiar de compañero no los
// borra (el nuevo "hereda" la comida del día, y está bien así).
//
// Repetir un cuidado se puede recién cuando pasó la mitad de su duración: si
// no, se podría encadenar `#pet comida` sin sentido.

export type Cuidado = 'comida' | 'agua' | 'paseo'

export const CUIDADOS: Record<Cuidado, { dura: number; emoji: string; nombre: string }> = {
  comida: { dura: 8 * 3_600_000,  emoji: '🍖', nombre: 'Comida' },
  agua:   { dura: 6 * 3_600_000,  emoji: '💧', nombre: 'Agua' },
  paseo:  { dura: 12 * 3_600_000, emoji: '🌳', nombre: 'Paseo' },
}

/** El paseo también da un poco de exp, aparte del tope por mensajes. */
export const EXP_PASEO = 15

type ConCuidado = ConDragones & Pick<UserData, 'cuidado'>

/** Cuánto le queda a un cuidado; 0 si ya se venció o nunca se hizo. */
export function restante(u: ConCuidado, c: Cuidado, ahora = Date.now()): number {
  const ts = u.cuidado?.[c]
  return ts ? Math.max(0, ts + CUIDADOS[c].dura - ahora) : 0
}

/** Cuántos de los tres están al día. */
export function atendidos(u: ConCuidado, ahora = Date.now()): number {
  return (Object.keys(CUIDADOS) as Cuidado[]).filter(c => restante(u, c, ahora) > 0).length
}

export type Cuidar =
  | { ok: true; exp: number; dragon: OwnedDragon }
  | { ok: false; motivo: 'sin-companero' }
  | { ok: false; motivo: 'lleno'; falta: number }

/** Hace un cuidado. Modifica `u` (y al compañero, si es un paseo). */
export function cuidar(u: ConCuidado, c: Cuidado, ahora = Date.now()): Cuidar {
  const d = companeroDe(u)
  if (!d) return { ok: false, motivo: 'sin-companero' }
  const queda = restante(u, c, ahora)
  const mitad = CUIDADOS[c].dura / 2
  if (queda > mitad) return { ok: false, motivo: 'lleno', falta: queda - mitad }

  u.cuidado = { ...u.cuidado, [c]: ahora }
  let exp = 0
  if (c === 'paseo') {
    exp = EXP_PASEO
    aplicarExp(d, exp, d.stage === 3 ? Infinity : STAGE3_LEVEL - 1)
  }
  return { ok: true, exp, dragon: d }
}

/**
 * Lo que dan los cuidados al día en #raid: +5% de daño cada uno, y el
 * contraataque del jefe pega un 15% menos por cada uno. Sin compañero, nada.
 */
export function bonoCuidado(u: ConCuidado, ahora = Date.now()): { danio: number; defensa: number; atendidos: number } {
  const n = companeroDe(u) ? atendidos(u, ahora) : 0
  return { danio: 1 + 0.05 * n, defensa: 1 - 0.15 * n, atendidos: n }
}
