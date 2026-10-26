// La tarjeta de #perfil: una imagen con la foto, el nivel, las barras de
// experiencia y salud, y los números del RPG.
//
// Como #qc y #texto (textImage.ts): un SVG armado en memoria que `sharp` —que
// es libvips, C nativo, y ya viene con el bot— pasa a imagen. Sin canvas, sin
// fuentes que instalar, sin archivos temporales. Sale en JPEG: WhatsApp
// recomprime todo a JPEG igual, y pesa una fracción de un PNG.
//
// Todo lo que viene del usuario (nombre, descripción, clan) se ESCAPA antes de
// entrar al SVG, como en textImage.ts: si no, alguien con un nombre como
// `</text><image href=…>` metería elementos en la imagen.
//
// Los textos ya vienen traducidos (`Etiquetas`): esto solo dibuja.

import { escapar, FUENTES, colorDe } from './textImage.js'
import { anchoTexto, cortar } from './terminal.js'

const W = 1000
const H = 560

export interface DatosTarjeta {
  nombre: string
  rol: string
  nivel: number
  exp: number
  expNecesaria: number
  puesto: number
  salud: number
  monedas: number
  oro: number
  dragones: number
  harem: number
  brasas: number
  comandos: number
  descripcion?: string | undefined
  clan?: string | undefined
  pareja?: string | undefined
  cumple?: string | undefined
  premium?: boolean | undefined
}

export interface Etiquetas {
  nivel: string
  puesto: string
  experiencia: string
  salud: string
  monedas: string
  oro: string
  dragones: string
  harem: string
  brasas: string
  comandos: string
  pareja: string
  cumple: string
}

/** 1234 → "1.234". El español no agrupa los de 4 cifras ("9999" al lado de
 *  "18.420" se ve mal en una tarjeta), así que el punto va siempre. */
const miles = (n: number) => Math.round(n).toLocaleString('de-DE')

/** 12.345 → "12,3 mil"; los números grandes, cortos para que entren en su celda. */
export function corto(n: number): string {
  const a = Math.abs(n)
  if (a < 10_000) return miles(n)
  if (a < 1_000_000) return `${(n / 1000).toFixed(a < 100_000 ? 1 : 0).replace('.', ',')} mil`
  if (a < 1_000_000_000) return `${(n / 1_000_000).toFixed(a < 100_000_000 ? 1 : 0).replace('.', ',')} M`
  return `${(n / 1_000_000_000).toFixed(1).replace('.', ',')} B`
}

/** Una barra redondeada con su relleno. */
function barra(x: number, y: number, w: number, h: number, frac: number, color: string, fondo = '#21262d'): string {
  const f = Math.max(0, Math.min(1, frac))
  const lleno = f > 0 ? `<rect x="${x}" y="${y}" width="${Math.max(h, Math.round(w * f))}" height="${h}" rx="${h / 2}" fill="${color}"/>` : ''
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${h / 2}" fill="${fondo}"/>${lleno}`
}

/** El SVG de la tarjeta. Aparte de `tarjetaPerfil` para poder probarlo sin sharp. */
export function svgTarjeta(d: DatosTarjeta, et: Etiquetas, avatar?: Buffer | null): string {
  const acento = d.premium ? '#f2c94c' : colorDe(d.nombre)
  const t = (x: number, y: number, size: number, texto: string, extra = '') =>
    `<text x="${x}" y="${y}" font-size="${size}" font-family="${FUENTES}" ${extra}>${escapar(texto)}</text>`

  const pctExp = d.expNecesaria > 0 ? d.exp / d.expNecesaria : 1
  const celdas: Array<[string, string]> = [
    [et.monedas, `¥${corto(d.monedas)}`],
    [et.oro, corto(d.oro)],
    [et.dragones, corto(d.dragones)],
    [et.harem, corto(d.harem)],
    [et.brasas, corto(d.brasas)],
    [et.comandos, corto(d.comandos)],
  ]
  const grilla = celdas.map(([etiqueta, valor], i) => {
    const cx = 330 + (i % 3) * 215
    const cy = 318 + Math.floor(i / 3) * 96
    return `<rect x="${cx}" y="${cy}" width="200" height="82" rx="14" fill="#161b22" stroke="#30363d"/>` +
      t(cx + 18, cy + 32, 18, etiqueta, 'fill="#8b949e"') +
      t(cx + 18, cy + 64, 30, valor, 'fill="#e6edf3" font-weight="bold"')
  }).join('')

  // Debajo de la foto: clan, pareja y cumpleaños, los que haya.
  const extras = [
    d.clan ? `⚔ ${d.clan}` : '',
    d.pareja ? `♡ ${et.pareja}: ${d.pareja}` : '',
    // Sin emojis de color: librsvg los dibuja con la fuente del sistema, y en un
    // servidor sin fuente de emojis salen como un cuadrado. ⚔ y ♡ están en
    // las fuentes comunes.
    d.cumple ? `${et.cumple}: ${d.cumple}` : '',
  ].filter(Boolean).map((s, i) => t(150, 352 + i * 32, 17, cortar(s, 28), 'fill="#c9d1d9" text-anchor="middle"')).join('')

  const avatarSvg = avatar
    ? `<image x="50" y="60" width="200" height="200" clip-path="url(#circulo)" preserveAspectRatio="xMidYMid slice" href="data:image/jpeg;base64,${avatar.toString('base64')}"/>`
    : `<circle cx="150" cy="160" r="100" fill="${acento}"/>` +
      t(150, 192, 92, [...d.nombre.trim()][0]?.toUpperCase() ?? '?', 'fill="#0d1117" font-weight="bold" text-anchor="middle"')

  const nombre = cortar(d.nombre, 26)
  const tamNombre = anchoTexto(nombre) > 20 ? 40 : 50

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="fondo" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0d1117"/><stop offset="1" stop-color="#161b22"/>
    </linearGradient>
    <linearGradient id="exp" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${acento}"/><stop offset="1" stop-color="#58a6ff"/>
    </linearGradient>
    <clipPath id="circulo"><circle cx="150" cy="160" r="100"/></clipPath>
  </defs>
  <rect width="${W}" height="${H}" rx="28" fill="url(#fondo)"/>
  <rect x="0" y="0" width="${W}" height="8" rx="4" fill="${acento}"/>
  <circle cx="150" cy="160" r="108" fill="none" stroke="${acento}" stroke-width="6"/>
  ${avatarSvg}
  ${extras}
  ${t(330, 100, tamNombre, nombre, 'fill="#e6edf3" font-weight="bold"')}
  ${d.premium ? t(330 + Math.min(600, anchoTexto(nombre) * tamNombre * 0.55) + 16, 100, 34, '★', `fill="${acento}"`) : ''}
  ${t(330, 140, 22, `${d.rol}  ·  ${et.nivel} ${d.nivel}  ·  ${et.puesto} #${d.puesto}`, 'fill="#8b949e"')}
  ${t(330, 190, 18, et.experiencia, 'fill="#8b949e"')}
  ${t(950, 190, 18, `${miles(d.exp)} / ${miles(d.expNecesaria)}  (${Math.round(Math.min(1, pctExp) * 100)}%)`, 'fill="#8b949e" text-anchor="end"')}
  ${barra(330, 202, 620, 22, pctExp, 'url(#exp)')}
  ${t(330, 256, 18, et.salud, 'fill="#8b949e"')}
  ${t(950, 256, 18, `${d.salud}/100`, 'fill="#8b949e" text-anchor="end"')}
  ${barra(330, 268, 620, 16, d.salud / 100, d.salud < 20 ? '#f85149' : '#3fb950')}
  ${grilla}
  ${d.descripcion ? t(500, 535, 20, `“${cortar(d.descripcion, 70)}”`, 'fill="#8b949e" font-style="italic" text-anchor="middle"') : ''}
</svg>`
}

/** La tarjeta en JPEG. `avatar`: la foto ya bajada (cualquier formato que lea sharp). */
export async function tarjetaPerfil(d: DatosTarjeta, et: Etiquetas, avatar?: Buffer | null): Promise<Buffer> {
  const sharp = (await import('sharp')).default
  // La foto achicada a lo que se ve (200 px): embebida en base64 en el SVG,
  // una de 640 px pesaría y se decodificaría tres veces más para nada.
  const chica = avatar ? await sharp(avatar).resize(200, 200, { fit: 'cover' }).jpeg({ quality: 85 }).toBuffer().catch(() => null) : null
  return sharp(Buffer.from(svgTarjeta(d, et, chica))).jpeg({ quality: 88 }).toBuffer()
}
