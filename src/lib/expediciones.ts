import { getUserData, patchUserData, checkLevelUp } from '@core/events.js'
import { bonoArma } from '@lib/forja.js'
import { companeroDe } from '@lib/companero.js'
import { enData, leerJson, guardarJson, esObjeto } from '@lib/archivoJson.js'
import {
  NIVELES, VIDA_MAX, generar, entrar, poderDe, cobrar, diaDe, OBJETO,
  type Mazmorra, type Sala,
} from '@lib/mazmorra.js'

// Las expediciones a la mazmorra del día (ver mazmorra.ts): una por grupo y
// por día, guardadas en data/mazmorra.json para que un reinicio no se lleve
// un botín a medio juntar.
//
// UNA expedición por persona por día, aunque esté en varios grupos: si no,
// el botín se repetiría entrando desde cada uno.

const ARCHIVO = enData('mazmorra.json')
/** Sin moverse esto, la expedición se cobra sola como si se retirara. */
const ABANDONO = 2 * 3_600_000

export type Fin = 'retirada' | 'terminada' | 'caida'

export interface Expedicion {
  gjid:          string
  nombreGrupo:   string
  dia:           string
  nivel:         number           // salas superadas: 0 al entrar, NIVELES al tumbar al jefe
  vida:          number
  botin:         number
  participantes: string[]
  camino:        number[]         // la puerta elegida en cada nivel
  ultimoMov:     number
  fin:           Fin | null
}

let expediciones: Record<string, Expedicion> = leerJson(ARCHIVO, {}, esObjeto)
let mapa: Mazmorra | null = null

const guardar = () => guardarJson(ARCHIVO, expediciones)

export function mazmorraDe(dia: string): Mazmorra {
  if (mapa?.dia !== dia) mapa = generar(dia)
  return mapa
}

const clave = (gjid: string, dia: string) => `${dia}|${gjid}`

/** Lo que se lleva cada uno al terminar, ya pagado. */
export interface Cobro { porCabeza: number; exp: number; como: Fin; participantes: string[] }

function pagar(e: Expedicion, como: Fin): Cobro {
  e.fin = como
  const porCabeza = cobrar(e.botin, e.participantes.length, como)
  const exp = Math.round(porCabeza * 0.1)
  for (const j of e.participantes) {
    const u = getUserData(j)
    patchUserData(j, { money: u.money + porCabeza, exp: u.exp + exp })
    checkLevelUp(j)
  }
  guardar()
  return { porCabeza, exp, como, participantes: e.participantes }
}

/**
 * Las que quedaron abiertas y nadie tocó en ABANDONO se cobran solas como una
 * retirada; las de hace más de dos días se olvidan. Se mira cada vez que se
 * usa el comando: no hace falta un temporizador para algo que solo importa
 * cuando alguien juega.
 */
function limpiar(): void {
  const ahora = Date.now()
  const hoy = diaDe(ahora)
  let cambio = false
  for (const [k, e] of Object.entries(expediciones)) {
    if (!e.fin && ahora - e.ultimoMov > ABANDONO) {
      pagar(e, 'retirada')
      cambio = true
    }
    if (e.dia < hoy && ahora - e.ultimoMov > 2 * 86_400_000) {
      delete expediciones[k]
      cambio = true
    }
  }
  if (cambio) guardar()
}

/** La de hoy del grupo, o la que sigue abierta de ayer: una que empezó a las
 *  23:59 UTC no se corta a medianoche (se juega con el mapa de su día). */
export function deHoy(gjid: string): Expedicion | null {
  limpiar()
  return expediciones[clave(gjid, diaDe(Date.now()))]
    ?? Object.values(expediciones).find(e => e.gjid === gjid && !e.fin)
    ?? null
}

/** ¿Ya jugó hoy en OTRO grupo? */
function jugoEnOtro(jid: string, gjid: string, dia: string): boolean {
  return Object.values(expediciones).some(e => e.dia === dia && e.gjid !== gjid && e.participantes.includes(jid))
}

export type Entrada =
  | { ok: true; e: Expedicion }
  | { ok: false; motivo: 'ya-hoy' | 'otro-grupo'; e?: Expedicion }

export function abrir(gjid: string, nombreGrupo: string, jid: string): Entrada {
  const dia = diaDe(Date.now())
  const ya = deHoy(gjid)
  if (ya) return { ok: false, motivo: 'ya-hoy', e: ya }
  if (jugoEnOtro(jid, gjid, dia)) return { ok: false, motivo: 'otro-grupo' }
  const e: Expedicion = {
    gjid, nombreGrupo, dia, nivel: 0, vida: VIDA_MAX, botin: 0,
    participantes: [jid], camino: [], ultimoMov: Date.now(), fin: null,
  }
  expediciones[clave(gjid, dia)] = e
  guardar()
  return { ok: true, e }
}

export function salasDelNivel(e: Expedicion): Sala[] {
  return mazmorraDe(e.dia).niveles[e.nivel] ?? []
}

/** El poder del grupo: la suma de cada uno (nivel, compañero, arma). */
export function poderGrupo(participantes: string[]): number {
  return participantes.reduce((s, j) => {
    const u = getUserData(j)
    return s + poderDe(u.level, companeroDe(u)?.level ?? 0, bonoArma(u.arma?.nivel ?? 0))
  }, 0)
}

export type Paso =
  | { ok: true; texto: string; e: Expedicion; cobro: Cobro | null; objetoPara: string | null }
  | { ok: false; motivo: 'sin-expedicion' | 'terminada' | 'puerta' | 'otro-grupo' }

/** `jid` abre la puerta `p` (desde 1). Entra a la expedición si no estaba. */
export function abrirPuerta(gjid: string, jid: string, p: number): Paso {
  const e = deHoy(gjid)
  if (!e) return { ok: false, motivo: 'sin-expedicion' }
  if (e.fin) return { ok: false, motivo: 'terminada' }
  const salas = salasDelNivel(e)
  const sala = salas[p - 1]
  if (!sala) return { ok: false, motivo: 'puerta' }
  if (!e.participantes.includes(jid)) {
    if (jugoEnOtro(jid, gjid, e.dia)) return { ok: false, motivo: 'otro-grupo' }
    e.participantes.push(jid)
  }

  const r = entrar(sala, poderGrupo(e.participantes), e.vida)
  e.vida = r.vida
  e.botin += r.botin
  e.camino.push(p)
  e.ultimoMov = Date.now()
  let objetoPara: string | null = null
  if (r.objeto) {
    // Un objeto no se reparte: se lo lleva el que abrió la puerta.
    const u = getUserData(jid)
    const cant = r.objeto === 'sp' ? 2 : 1
    patchUserData(jid, { items: { [r.objeto]: u.items[r.objeto] + cant } })
    objetoPara = jid
  }

  let cobro: Cobro | null = null
  if (e.vida <= 0) cobro = pagar(e, 'caida')
  else {
    e.nivel++
    if (e.nivel >= NIVELES) cobro = pagar(e, 'terminada')
    else guardar()
  }
  return { ok: true, texto: r.texto, e, cobro, objetoPara }
}

export function retirarse(gjid: string): Cobro | null {
  const e = deHoy(gjid)
  if (!e || e.fin) return null
  return pagar(e, 'retirada')
}

/** Las expediciones de hoy, de la que llegó más hondo a la que menos. */
export function ranking(): Expedicion[] {
  limpiar()
  const hoy = diaDe(Date.now())
  return Object.values(expediciones)
    .filter(e => e.dia === hoy)
    .sort((a, b) => b.nivel - a.nivel || b.botin - a.botin)
}

export { OBJETO }
