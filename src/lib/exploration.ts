// #explorar: una cueva por grupo, con niebla de guerra, que el grupo entero
// recorre moviendo la misma ficha. Lógica pura: sin WhatsApp ni estado propio
// (el estado vive en la configuración del grupo); se prueba desde
// scripts/exploration.test.js.
//
// El mapa no se guarda: sale de una SEMILLA, siempre igual. Lo que se guarda
// es lo que cambia —dónde está el grupo, qué se vio y qué ya se agarró—, en
// dos bitsets: 40x40 casillas son 200 bytes cada uno.
//
// La cueva se cava desde el centro con una caminata al azar ("drunkard's
// walk"): todo el suelo está conectado por construcción, no hay zonas a las
// que no se pueda llegar. La reliquia va en la casilla de suelo más lejana de
// la entrada; encontrarla termina la temporada.

import { azarDe } from './dungeon.js'

export const ANCHO = 40
export const ALTO = 40
const CASILLAS = ANCHO * ALTO
/** Cuánto del mapa es suelo. */
const SUELO = 0.42

export const C = {
  Pared: 0,
  Suelo: 1,
  Tesoro: 2,
  Trampa: 3,
  Monstruo: 4,
  Fuente: 5,
  /** Una pared que se puede atravesar: se descubre intentando pasar. */
  Secreta: 6,
  Reliquia: 7,
} as const

export interface Mapa {
  semilla: number
  celdas: Uint8Array
  inicio: number
  reliquia: number
  /** Lo que vale cada casilla con premio (tesoro: ¥; monstruo y trampa: cuánto pegan). */
  fuerza: Uint16Array
}

const idx = (x: number, y: number) => y * ANCHO + x
export const xy = (i: number) => ({ x: i % ANCHO, y: Math.floor(i / ANCHO) })
const dentro = (x: number, y: number) => x >= 0 && y >= 0 && x < ANCHO && y < ALTO

const VECINOS: Array<[number, number]> = [[0, -1], [1, 0], [0, 1], [-1, 0]]

/** El mapa de una semilla. Siempre el mismo: por eso no hace falta guardarlo. */
export function generar(semilla: number): Mapa {
  const az = azarDe(semilla)
  const celdas = new Uint8Array(CASILLAS)
  const fuerza = new Uint16Array(CASILLAS)
  let x = ANCHO >> 1
  let y = ALTO >> 1
  const inicio = idx(x, y)
  celdas[inicio] = C.Suelo
  let cavadas = 1
  // Caminata al azar, sin pisar el borde (queda de pared).
  while (cavadas < CASILLAS * SUELO) {
    const [dx, dy] = VECINOS[Math.floor(az() * 4)]!
    const nx = x + dx
    const ny = y + dy
    if (nx < 1 || ny < 1 || nx >= ANCHO - 1 || ny >= ALTO - 1) continue
    x = nx
    y = ny
    if (celdas[idx(x, y)] === C.Pared) { celdas[idx(x, y)] = C.Suelo; cavadas++ }
  }

  // La reliquia, en el suelo más lejano de la entrada (por pasos, no en línea recta).
  const dist = distancias(celdas, inicio)
  let reliquia = inicio
  for (let i = 0; i < CASILLAS; i++) if (Number.isFinite(dist[i]) && dist[i]! > dist[reliquia]!) reliquia = i
  celdas[reliquia] = C.Reliquia

  // Lo demás, en el suelo libre, lejos de la entrada (a más de 2 pasos).
  for (let i = 0; i < CASILLAS; i++) {
    if (celdas[i] !== C.Suelo || dist[i]! <= 2) continue
    const r = az()
    if (r < 0.05) { celdas[i] = C.Tesoro; fuerza[i] = 200 + Math.floor(az() * 7) * 100 }
    else if (r < 0.09) { celdas[i] = C.Trampa; fuerza[i] = 8 + Math.floor(az() * 13) }
    else if (r < 0.13) { celdas[i] = C.Monstruo; fuerza[i] = 6 + Math.floor(az() * 13) }
    else if (r < 0.145) celdas[i] = C.Fuente
  }

  // Tres paredes secretas, pegadas al suelo y no en el borde.
  let secretas = 0
  for (let intento = 0; secretas < 3 && intento < 5000; intento++) {
    const i = Math.floor(az() * CASILLAS)
    const { x: px, y: py } = xy(i)
    if (celdas[i] !== C.Pared || px < 1 || py < 1 || px >= ANCHO - 1 || py >= ALTO - 1) continue
    if (VECINOS.some(([dx, dy]) => celdas[idx(px + dx, py + dy)] !== C.Pared)) {
      celdas[i] = C.Secreta
      fuerza[i] = 2000 + Math.floor(az() * 11) * 100
      secretas++
    }
  }
  return { semilla, celdas, inicio, reliquia, fuerza }
}

/** Pasos desde `desde` a cada casilla que no sea pared (Infinity si no se llega). */
export function distancias(celdas: Uint8Array, desde: number): Float64Array {
  const d = new Float64Array(CASILLAS).fill(Infinity)
  d[desde] = 0
  const cola = [desde]
  for (let k = 0; k < cola.length; k++) {
    const i = cola[k]!
    const { x, y } = xy(i)
    for (const [dx, dy] of VECINOS) {
      const nx = x + dx
      const ny = y + dy
      if (!dentro(nx, ny)) continue
      const j = idx(nx, ny)
      if (celdas[j] === C.Pared || celdas[j] === C.Secreta || d[j] !== Infinity) continue
      d[j] = d[i]! + 1
      cola.push(j)
    }
  }
  return d
}

// ── Bitsets (lo que se vio, lo que ya se agarró) ─────────────────────────────

export const bitsVacios = () => new Uint8Array(Math.ceil(CASILLAS / 8))
export const tiene = (b: Uint8Array, i: number) => (b[i >> 3]! & (1 << (i & 7))) !== 0
export const poner = (b: Uint8Array, i: number) => { b[i >> 3]! |= 1 << (i & 7) }
export const aTexto = (b: Uint8Array) => Buffer.from(b).toString('base64')
export const deTexto = (s: string | undefined): Uint8Array => {
  const b = bitsVacios()
  if (s) b.set(Buffer.from(s, 'base64').subarray(0, b.length))
  return b
}
export function contar(b: Uint8Array): number {
  let n = 0
  for (const byte of b) { let v = byte; while (v) { v &= v - 1; n++ } }
  return n
}

/** Lo que se guarda en la configuración del grupo. */
export interface Exploracion {
  temporada: number
  semilla: number
  pos: number
  vistas: string
  usadas: string
  /** Pasos de cada explorador en la temporada: con eso se reparte la reliquia. */
  pasos: Record<string, number>
}

export function nuevaTemporada(gjid: string, temporada: number): Exploracion {
  // La semilla sale del grupo y la temporada: cada grupo, su cueva.
  let h = 2166136261
  for (const c of `${gjid}#${temporada}`) h = Math.imul(h ^ c.charCodeAt(0), 16777619)
  const semilla = h >>> 0
  const mapa = generar(semilla)
  const vistas = bitsVacios()
  revelar(vistas, mapa.inicio)
  return { temporada, semilla, pos: mapa.inicio, vistas: aTexto(vistas), usadas: aTexto(bitsVacios()), pasos: {} }
}

/** Las 8 casillas de alrededor y la propia, vistas. */
export function revelar(vistas: Uint8Array, i: number): number {
  const { x, y } = xy(i)
  let nuevas = 0
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (!dentro(x + dx, y + dy)) continue
      const j = idx(x + dx, y + dy)
      if (!tiene(vistas, j)) { poner(vistas, j); nuevas++ }
    }
  }
  return nuevas
}

export type Direccion = 'n' | 's' | 'e' | 'o'
export const DIRECCION: Record<string, Direccion> = {
  n: 'n', norte: 'n', arriba: 'n', up: 'n', north: 'n', w: 'n',
  s: 's', sur: 's', abajo: 's', down: 's', south: 's', sul: 's',
  e: 'e', este: 'e', derecha: 'e', right: 'e', east: 'e', leste: 'e', d: 'e',
  o: 'o', oeste: 'o', izquierda: 'o', left: 'o', west: 'o', a: 'o',
}
const PASO: Record<Direccion, [number, number]> = { n: [0, -1], s: [0, 1], e: [1, 0], o: [-1, 0] }

export type Evento =
  | { tipo: 'pared' }
  | { tipo: 'nada'; nuevas: number }
  | { tipo: 'tesoro'; dinero: number; nuevas: number }
  | { tipo: 'trampa'; danio: number; nuevas: number }
  | { tipo: 'monstruo'; danio: number; exp: number; dinero: number; nuevas: number }
  | { tipo: 'fuente'; cura: number; nuevas: number }
  | { tipo: 'secreta'; dinero: number; nuevas: number }
  | { tipo: 'reliquia'; nuevas: number }

/**
 * El grupo da un paso. Modifica `e` (posición, vistas, usadas, pasos) y dice
 * qué pasó; quien llama cobra o hiere al jugador. Lo que se agarra se agarra
 * una vez: el próximo que pase por ahí encuentra suelo.
 */
export function mover(e: Exploracion, mapa: Mapa, quien: string, dir: Direccion): Evento {
  const { x, y } = xy(e.pos)
  const [dx, dy] = PASO[dir]
  if (!dentro(x + dx, y + dy)) return { tipo: 'pared' }
  const destino = idx(x + dx, y + dy)
  const celda = mapa.celdas[destino]!
  if (celda === C.Pared) {
    // Chocar con una pared también la deja vista.
    const vistas = deTexto(e.vistas)
    poner(vistas, destino)
    e.vistas = aTexto(vistas)
    return { tipo: 'pared' }
  }

  const vistas = deTexto(e.vistas)
  const usadas = deTexto(e.usadas)
  e.pos = destino
  const nuevas = revelar(vistas, destino)
  e.vistas = aTexto(vistas)
  e.pasos[quien] = (e.pasos[quien] ?? 0) + 1

  const ya = tiene(usadas, destino)
  const usar = () => { poner(usadas, destino); e.usadas = aTexto(usadas) }
  const f = mapa.fuerza[destino]!
  if (!ya) {
    switch (celda) {
      case C.Tesoro: usar(); return { tipo: 'tesoro', dinero: f, nuevas }
      case C.Trampa: usar(); return { tipo: 'trampa', danio: f, nuevas }
      case C.Monstruo: usar(); return { tipo: 'monstruo', danio: f, exp: f * 6, dinero: f * 15, nuevas }
      case C.Fuente: usar(); return { tipo: 'fuente', cura: 30, nuevas }
      case C.Secreta: usar(); return { tipo: 'secreta', dinero: f, nuevas }
      case C.Reliquia: return { tipo: 'reliquia', nuevas }
    }
  }
  return { tipo: 'nada', nuevas }
}

/**
 * Lo que cobra cada uno al encontrar la reliquia: un piso para todos los que
 * exploraron y el resto según cuántos pasos dio, más un extra para quien la
 * encontró. Con tope de pasos por persona, para que un spam de movimientos no
 * se lleve todo.
 */
export function repartoReliquia(pasos: Record<string, number>, quien: string, bolsa = 10_000): Record<string, number> {
  const efectivos = Object.entries(pasos).map(([j, n]) => [j, Math.min(n, 150)] as const)
  const total = efectivos.reduce((a, [, n]) => a + n, 0)
  const piso = 500
  const out: Record<string, number> = {}
  for (const [j, n] of efectivos) out[j] = piso + Math.round((total ? n / total : 0) * bolsa)
  out[quien] = (out[quien] ?? piso) + 3000
  return out
}

/** Qué parte del suelo se vio, de 0 a 1. */
export function progreso(mapa: Mapa, vistas: Uint8Array): number {
  let suelo = 0
  let visto = 0
  for (let i = 0; i < CASILLAS; i++) {
    if (mapa.celdas[i] === C.Pared) continue
    suelo++
    if (tiene(vistas, i)) visto++
  }
  return suelo ? visto / suelo : 0
}
