// Mover saldos con los datos del bot y la decisión de Ada/SPARK de la
// Session API (ver lib/ledger.ts y crates/session-api/ada/src/ledger.ads).

import { type CooldownKey, getUserData, patchUserData, setCooldown } from '@core/events/index.js'
import { logger } from '@core/logger.js'
import { rustHttp } from '@lib/rustHttp.js'
import { enData, guardarJson, leerJson } from '@lib/jsonFile.js'
import { type Cambio, type Campo, type Deps, type Pedido, type Resultado, type ResultadoAplicar, aplicar, mover } from '@lib/ledger.js'

const deps: Deps = {
  leer: (c) => getUserData(c.jid)[c.campo] as number,
  escribir: (c, valor) => patchUserData(c.jid, { [c.campo]: valor }),
  decidir: async (p) => {
    try {
      const r = await rustHttp.post<{ codigo: number; origen: number; destino: number }>('/economy/move', p, {
        timeout: 3_000,
      })
      return r.data
    } catch (err) {
      logger.warn({ err }, '[economía] la Session API no respondió: no se movió nada')
      return null
    }
  },
  aplicar: async (p) => {
    try {
      const r = await rustHttp.post<{ codigo: number; saldos: number[] }>('/economy/apply', p, { timeout: 3_000 })
      return r.data
    } catch (err) {
      logger.warn({ err }, '[economía] la Session API no respondió: no se cambió nada')
      return null
    }
  },
}

export function moverSaldo(p: Pedido): Promise<Resultado> {
  return mover(p, deps)
}

/**
 * Ganar o gastar —uno o varios saldos a la vez—, todo o nada. Para lo que
 * cambia junto con los saldos (un cooldown, un inventario), escribirlo
 * después y solo si `ok`.
 */
export function cambiarSaldos(cambios: readonly Cambio[]): Promise<ResultadoAplicar> {
  return aplicar(cambios, deps)
}

/**
 * Para lo que se cobra una vez cada tanto (#work, #daily, un cofre): reserva
 * el cooldown ANTES de cobrar y, si el cobro falla, lo deja como estaba. Con
 * la espera del cobro, marcarlo después dejaba que dos comandos casi
 * simultáneos pasaran los dos el chequeo y cobraran dos veces.
 */
export async function cobrarConCooldown(
  jid: string,
  clave: CooldownKey,
  cambios: readonly Cambio[],
): Promise<ResultadoAplicar> {
  const antes = getUserData(jid).cooldowns[clave]
  setCooldown(jid, clave)
  const r = await cambiarSaldos(cambios)
  if (!r.ok) {
    const cds = getUserData(jid).cooldowns
    if (antes === undefined) delete cds[clave]
    else cds[clave] = antes
  }
  return r
}

/**
 * Para lo que además del saldo gasta otra cosa (espadas en #forjar, el lugar
 * de un negocio): `reservar` la aparta ANTES de cobrar y devuelve cómo
 * deshacerlo; si el cobro falla, se deshace. Sin esto, dos comandos a la vez
 * pasarían los dos el chequeo y gastarían la misma cosa dos veces.
 */
export async function cobrarReservando(
  cambios: readonly Cambio[],
  reservar: () => () => void,
): Promise<ResultadoAplicar> {
  const deshacer = reservar()
  const r = await cambiarSaldos(cambios)
  if (!r.ok) deshacer()
  return r
}

// ─── Premios que no se pierden ───────────────────────────────────────────────
// Para lo que paga a varios a la vez y desde código que no espera (el raid,
// las expediciones, el asesino, las subastas): cada uno cobra por Aplicar y,
// si la Session API no responde, el premio queda anotado y se paga en el
// próximo arranque (pagarPendientes, desde el 'ready' de index.ts). Lo mismo
// que openBets.ts hace con las apuestas, para cualquier saldo.

const PENDIENTES = enData('economy-pending.json')
type Premio = Partial<Record<Campo, number>>
interface Pendiente {
  jid: string
  premio: Premio
}

function anotarPendiente(p: Pendiente): void {
  const todos = leerJson<Pendiente[]>(PENDIENTES, [], Array.isArray)
  todos.push(p)
  guardarJson(PENDIENTES, todos)
}

function cambiosDe(jid: string, premio: Premio): Cambio[] {
  return (Object.entries(premio) as Array<[Campo, number]>)
    .filter(([, v]) => v > 0)
    .map(([campo, delta]) => ({ cuenta: { jid, campo }, delta }))
}

/** Le acredita un premio a `jid`; si no se puede ahora, queda anotado. true si se pagó ya. */
export async function acreditar(jid: string, premio: Premio): Promise<boolean> {
  const cambios = cambiosDe(jid, premio)
  if (!cambios.length) return true
  const r = await cambiarSaldos(cambios)
  if (r.ok) return true
  anotarPendiente({ jid, premio })
  logger.warn({ jid, premio, motivo: r.motivo }, '[economía] premio anotado para el próximo arranque')
  return false
}

/** Paga lo que quedó anotado. Lo que vuelve a fallar sigue anotado. */
export async function pagarPendientes(): Promise<void> {
  const todos = leerJson<Pendiente[]>(PENDIENTES, [], Array.isArray)
  if (!todos.length) return
  guardarJson(PENDIENTES, [])
  let pagados = 0
  for (const p of todos) {
    if (typeof p?.jid !== 'string' || !p.premio) continue
    if (await acreditar(p.jid, p.premio)) pagados++
  }
  logger.info({ pendientes: todos.length, pagados }, '[economía] premios pendientes')
}
