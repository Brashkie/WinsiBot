// Imágenes con texto, para stickers: la cita de un mensaje (#qc) y un texto
// grande con borde (#texto). Se arman como SVG y `sharp` —que ya viene con los
// stickers— los pasa a PNG: sin canvas nativo, sin fuentes que instalar.
//
// Todo lo que viene del chat se ESCAPA antes de entrar al SVG: si no, alguien
// que escriba `</text><image href="…">` podría meter elementos en la imagen.

const LADO = 512
/** Con "sans-serif" a secas, en Windows librsvg cae en una fuente de ancho fijo. */
export const FUENTES = 'Arial, Helvetica, Segoe UI, DejaVu Sans, Noto Sans, Roboto, sans-serif'
/** Ancho medio de un carácter, en "em". Conservador: si sobra, queda aire; si
 *  falta, el texto se sale de la burbuja (pasaba con 0,56). */
const ANCHO_LETRA = 0.62

export function escapar(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
}

/** Parte `texto` en líneas de hasta `ancho` caracteres, cortando en espacios. */
export function partir(texto: string, ancho: number): string[] {
  const lineas: string[] = []
  for (const parrafo of texto.split('\n')) {
    let actual = ''
    for (const palabra of parrafo.split(/\s+/).filter(Boolean)) {
      // Una palabra más larga que la línea se corta a la fuerza.
      let p = palabra
      while ([...p].length > ancho) {
        if (actual) { lineas.push(actual); actual = '' }
        lineas.push([...p].slice(0, ancho).join(''))
        p = [...p].slice(ancho).join('')
      }
      if (!actual) actual = p
      else if ([...actual].length + 1 + [...p].length <= ancho) actual += ' ' + p
      else { lineas.push(actual); actual = p }
    }
    lineas.push(actual)
  }
  return lineas.filter((l, i, a) => l || (i > 0 && i < a.length - 1))
}

/** Un color estable para cada nombre, como WhatsApp en los grupos. */
export function colorDe(nombre: string): string {
  const paleta = ['#e542a3', '#35cd96', '#6bcbef', '#fe7c7f', '#ba73e8', '#ffa97a', '#53bdeb', '#1f7aec']
  let h = 0
  for (const c of nombre) h = (h * 31 + c.codePointAt(0)!) >>> 0
  return paleta[h % paleta.length]!
}

async function aPng(svg: string): Promise<Buffer> {
  const sharp = (await import('sharp')).default
  return sharp(Buffer.from(svg)).png().toBuffer()
}

/** La burbuja de un mensaje citado: avatar (o inicial), nombre y texto. */
export async function cita(nombre: string, texto: string, avatar?: Buffer | null): Promise<Buffer> {
  const fuente = 28
  const alto = Math.round(fuente * 1.25)
  const x0 = 96
  const anchoMax = LADO - x0 - 8
  // Cuántos caracteres entran en la burbuja más ancha posible.
  const porLinea = Math.floor((anchoMax - 40) / (fuente * ANCHO_LETRA))
  let lineas = partir(texto, porLinea)
  const maxLineas = 9
  if (lineas.length > maxLineas) lineas = [...lineas.slice(0, maxLineas - 1), [...lineas[maxLineas - 1]!].slice(0, porLinea - 1).join('') + '…']
  const nombreCorto = [...nombre].length > porLinea ? [...nombre].slice(0, porLinea - 1).join('') + '…' : nombre
  const masLarga = Math.max(...lineas.map(l => [...l].length), [...nombreCorto].length)
  const ancho = Math.min(anchoMax, Math.max(160, Math.ceil(masLarga * fuente * ANCHO_LETRA) + 40))
  const altoBurbuja = 24 + alto + lineas.length * alto + 20
  const y0 = Math.max(8, Math.round((LADO - altoBurbuja) / 2))
  const color = colorDe(nombre)
  const inicial = escapar([...nombre.trim()][0]?.toUpperCase() ?? '?')

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${LADO}" height="${LADO}">
  <defs><clipPath id="c"><circle cx="44" cy="${y0 + 32}" r="32"/></clipPath></defs>
  ${avatar
    ? `<image x="12" y="${y0}" width="64" height="64" clip-path="url(#c)" xlink:href="data:image/jpeg;base64,${avatar.toString('base64')}"/>`
    : `<circle cx="44" cy="${y0 + 32}" r="32" fill="${color}"/><text x="44" y="${y0 + 44}" font-size="32" font-family="${FUENTES}" font-weight="bold" fill="#fff" text-anchor="middle">${inicial}</text>`}
  <rect x="${x0}" y="${y0}" width="${ancho}" height="${altoBurbuja}" rx="22" fill="#1f2c33"/>
  <text x="${x0 + 20}" y="${y0 + 20 + fuente}" font-size="${fuente - 2}" font-family="${FUENTES}" font-weight="bold" fill="${color}">${escapar(nombreCorto)}</text>
  ${lineas.map((l, i) => `<text x="${x0 + 20}" y="${y0 + 20 + alto + fuente + i * alto}" font-size="${fuente}" font-family="${FUENTES}" fill="#e9edef">${escapar(l)}</text>`).join('\n  ')}
</svg>`
  return aPng(svg)
}

/** Texto grande, centrado y con borde, sobre fondo transparente. */
export async function textoGrande(texto: string): Promise<Buffer> {
  // El tamaño de letra más grande con el que entra todo.
  let fuente = 120
  let lineas: string[] = []
  for (; fuente >= 28; fuente -= 4) {
    const ancho = Math.max(1, Math.floor(LADO / (fuente * 0.6)))
    lineas = partir(texto, ancho)
    if (lineas.length * fuente * 1.15 <= LADO - 40) break
  }
  const alto = fuente * 1.15
  const y0 = (LADO - lineas.length * alto) / 2 + fuente * 0.85
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${LADO}" height="${LADO}">
  ${lineas.map((l, i) => `<text x="${LADO / 2}" y="${y0 + i * alto}" font-size="${fuente}" font-family="${FUENTES}" font-weight="900" text-anchor="middle" fill="#ffffff" stroke="#000000" stroke-width="${Math.max(3, fuente / 12)}" paint-order="stroke">${escapar(l)}</text>`).join('\n  ')}
</svg>`
  return aPng(svg)
}
