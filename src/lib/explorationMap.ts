// El dibujo de la cueva de #explorar (exploration.ts): la imagen entera con
// `#explorar mapa`, y un recorte en emojis alrededor del grupo con cada paso,
// que no cuesta un render.
//
// Lo que no se vio va en negro. Las trampas se ven como suelo hasta que
// alguien las pisa, y las paredes secretas como pared hasta que alguien pasa:
// si se vieran, no serían trampas ni secretos.

import { C, ANCHO, ALTO, tiene, xy, type Mapa } from './exploration.js'
import { escapar, FUENTES } from './textImage.js'

/** Lo que muestra una casilla, con lo que se sabe de ella. */
export type Vista = 'oculta' | 'pared' | 'suelo' | 'tesoro' | 'trampa' | 'monstruo' | 'fuente' | 'secreta' | 'reliquia'

export function vistaDe(mapa: Mapa, vistas: Uint8Array, usadas: Uint8Array, i: number): Vista {
  if (!tiene(vistas, i)) return 'oculta'
  const usada = tiene(usadas, i)
  switch (mapa.celdas[i]) {
    case C.Pared: return 'pared'
    case C.Secreta: return usada ? 'secreta' : 'pared'
    case C.Trampa: return usada ? 'trampa' : 'suelo'
    case C.Tesoro: return usada ? 'suelo' : 'tesoro'
    case C.Monstruo: return usada ? 'suelo' : 'monstruo'
    case C.Fuente: return usada ? 'suelo' : 'fuente'
    case C.Reliquia: return 'reliquia'
    default: return 'suelo'
  }
}

const EMOJI: Record<Vista, string> = {
  oculta: '⬛', pared: '🟫', suelo: '⬜', tesoro: '💰', trampa: '🕳️',
  monstruo: '👹', fuente: '⛲', secreta: '🚪', reliquia: '🏺',
}

/** El recorte de `radio` casillas alrededor del grupo, en emojis. */
export function recorte(mapa: Mapa, pos: number, vistas: Uint8Array, usadas: Uint8Array, radio = 3): string {
  const { x: cx, y: cy } = xy(pos)
  const filas: string[] = []
  for (let y = cy - radio; y <= cy + radio; y++) {
    let fila = ''
    for (let x = cx - radio; x <= cx + radio; x++) {
      if (x === cx && y === cy) fila += '🧭'
      else if (x < 0 || y < 0 || x >= ANCHO || y >= ALTO) fila += '⬛'
      else fila += EMOJI[vistaDe(mapa, vistas, usadas, y * ANCHO + x)]
    }
    filas.push(fila)
  }
  return filas.join('\n')
}

const COLOR: Record<Vista, string> = {
  oculta: '#0d1117', pared: '#5b4636', suelo: '#c9d1d9', tesoro: '#f2c94c', trampa: '#8e44ad',
  monstruo: '#e5534b', fuente: '#39c5cf', secreta: '#d29922', reliquia: '#3fb950',
}

const LADO = 16
const MARGEN = 20
const CABECERA = 64

/**
 * El SVG del mapa. Las casillas iguales seguidas en una fila van en un solo
 * rectángulo: una cueva vista a medias son ~300 en vez de 1600.
 */
export function svgMapa(mapa: Mapa, pos: number, vistas: Uint8Array, usadas: Uint8Array, titulo: string, pie: string): string {
  const w = ANCHO * LADO + MARGEN * 2
  const h = ALTO * LADO + MARGEN * 2 + CABECERA
  const partes: string[] = []
  for (let y = 0; y < ALTO; y++) {
    let x = 0
    while (x < ANCHO) {
      const v = vistaDe(mapa, vistas, usadas, y * ANCHO + x)
      let fin = x + 1
      while (fin < ANCHO && vistaDe(mapa, vistas, usadas, y * ANCHO + fin) === v) fin++
      if (v !== 'oculta') {
        partes.push(`<rect x="${MARGEN + x * LADO}" y="${CABECERA + MARGEN + y * LADO}" width="${(fin - x) * LADO}" height="${LADO}" fill="${COLOR[v]}"/>`)
      }
      x = fin
    }
  }
  const { x: px, y: py } = xy(pos)
  const cx = MARGEN + px * LADO + LADO / 2
  const cy = CABECERA + MARGEN + py * LADO + LADO / 2
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">` +
    `<rect width="100%" height="100%" fill="#0d1117"/>` +
    `<text x="${MARGEN}" y="38" font-size="24" font-weight="bold" font-family="${FUENTES}" fill="#e6edf3">${escapar(titulo)}</text>` +
    `<text x="${w - MARGEN}" y="38" font-size="16" font-family="${FUENTES}" fill="#8b949e" text-anchor="end">${escapar(pie)}</text>` +
    partes.join('') +
    `<circle cx="${cx}" cy="${cy}" r="${LADO * 0.75}" fill="none" stroke="#58a6ff" stroke-width="3"/>` +
    `<circle cx="${cx}" cy="${cy}" r="${LADO * 0.35}" fill="#58a6ff"/>` +
    `</svg>`
}

/** El mapa en JPEG. */
export async function imagenMapa(mapa: Mapa, pos: number, vistas: Uint8Array, usadas: Uint8Array, titulo: string, pie: string): Promise<Buffer> {
  const sharp = (await import('sharp')).default
  return sharp(Buffer.from(svgMapa(mapa, pos, vistas, usadas, titulo, pie))).jpeg({ quality: 85 }).toBuffer()
}
