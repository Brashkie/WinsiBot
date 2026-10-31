// Códigos QR: el que se escanea para vincular el bot (en la consola) y el de
// los sub-bots (como imagen).
//
// Reemplaza a `qrcode`, que traía 22 paquetes —casi todos para su programa de
// línea de comandos (yargs y compañía), que el bot nunca usa—. Esto es el
// estándar ISO 18004 en modo byte: los datos, Reed-Solomon sobre GF(256), los
// patrones fijos, la colocación en zigzag y la mejor de las ocho máscaras.
//
// Antes de sacar la librería se comparó contra ella con el mismo modo: los
// mismos módulos, el mismo texto de consola y los mismos píxeles en cientos
// de textos, incluidos los del largo del QR de Baileys (~240 caracteres).
//
// Lógica pura salvo `qrPng`, que carga sharp al usarse.

/** Total de codewords por versión (datos + corrección). */
const CODEWORDS = [0, 26, 44, 70, 100, 134, 172, 196, 242, 292, 346, 404, 466, 532, 581, 655, 733, 815, 901, 991, 1085,
  1156, 1258, 1364, 1474, 1588, 1706, 1828, 1921, 2051, 2185, 2323, 2465, 2611, 2761, 2876, 3034, 3196, 3362, 3532, 3706]
/** Por versión, nivel M: cuántos bloques y cuántos codewords de corrección en total. */
const BLOQUES_M = [0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49]
const CORRECCION_M = [0, 10, 16, 26, 36, 48, 64, 72, 88, 110, 130, 150, 176, 198, 216, 240, 280, 308, 338, 364, 416, 442, 476, 504,
  560, 588, 644, 700, 728, 784, 812, 868, 924, 980, 1036, 1064, 1120, 1204, 1260, 1316, 1372]
/** Los bits del nivel M en la información de formato. */
const NIVEL_M = 0

// ── GF(256), polinomio 0x11D ────────────────────────────────────────────────
const EXP = new Uint8Array(512)
const LOG = new Uint8Array(256)
{
  let x = 1
  for (let i = 0; i < 255; i++) {
    EXP[i] = x
    LOG[x] = i
    x <<= 1
    if (x & 0x100) x ^= 0x11d
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255]!
}
const mul = (a: number, b: number) => (a === 0 || b === 0 ? 0 : EXP[LOG[a]! + LOG[b]!]!)

const generadores = new Map<number, Uint8Array>()
function generador(grado: number): Uint8Array {
  const hecho = generadores.get(grado)
  if (hecho) return hecho
  let g: Uint8Array = new Uint8Array([1])
  for (let i = 0; i < grado; i++) {
    const sig: Uint8Array = new Uint8Array(g.length + 1)
    for (let j = 0; j < g.length; j++) {
      sig[j] = sig[j]! ^ g[j]!
      sig[j + 1] = sig[j + 1]! ^ mul(g[j]!, EXP[i]!)
    }
    g = sig
  }
  generadores.set(grado, g)
  return g
}

/** Los codewords de corrección de un bloque: el resto de dividir por el generador. */
function reedSolomon(datos: Uint8Array, grado: number): Uint8Array {
  const g = generador(grado)
  const resto = new Uint8Array(datos.length + grado)
  resto.set(datos)
  for (let i = 0; i < datos.length; i++) {
    const c = resto[i]!
    if (c === 0) continue
    for (let j = 0; j < g.length; j++) resto[i + j] = resto[i + j]! ^ mul(g[j]!, c)
  }
  return resto.subarray(datos.length)
}

// ── Datos ───────────────────────────────────────────────────────────────────
const bitsDeLargo = (v: number) => (v < 10 ? 8 : 16)

function version(bytes: number): number {
  for (let v = 1; v <= 40; v++) {
    if (4 + bitsDeLargo(v) + bytes * 8 <= (CODEWORDS[v]! - CORRECCION_M[v]!) * 8) return v
  }
  throw new Error('demasiados datos para un QR')
}

function codewords(texto: Uint8Array, v: number): Uint8Array {
  const total = CODEWORDS[v]!
  const deDatos = total - CORRECCION_M[v]!
  const bits: number[] = []
  const poner = (valor: number, n: number) => { for (let i = n - 1; i >= 0; i--) bits.push((valor >>> i) & 1) }
  poner(0b0100, 4) // modo byte
  poner(texto.length, bitsDeLargo(v))
  for (const b of texto) poner(b, 8)
  if (bits.length + 4 <= deDatos * 8) poner(0, 4) // terminador
  while (bits.length % 8) bits.push(0)
  const datos = new Uint8Array(deDatos)
  for (let i = 0; i < bits.length / 8; i++) {
    let b = 0
    for (let k = 0; k < 8; k++) b = (b << 1) | bits[i * 8 + k]!
    datos[i] = b
  }
  for (let i = bits.length / 8, k = 0; i < deDatos; i++, k++) datos[i] = k % 2 ? 0x11 : 0xec

  // Bloques: los del grupo 2 llevan un codeword de datos más.
  const bloques = BLOQUES_M[v]!
  const enGrupo2 = total % bloques
  const enGrupo1 = bloques - enGrupo2
  const datosG1 = Math.floor(deDatos / bloques)
  const grado = Math.floor(total / bloques) - datosG1
  const dc: Uint8Array[] = []
  const ec: Uint8Array[] = []
  let o = 0
  for (let b = 0; b < bloques; b++) {
    const n = b < enGrupo1 ? datosG1 : datosG1 + 1
    dc.push(datos.subarray(o, o + n))
    ec.push(reedSolomon(dc[b]!, grado))
    o += n
  }
  // Intercalados: el codeword i de cada bloque, después los de corrección.
  const salida = new Uint8Array(total)
  let k = 0
  for (let i = 0; i <= datosG1; i++) for (const d of dc) if (i < d.length) salida[k++] = d[i]!
  for (let i = 0; i < grado; i++) for (const e of ec) salida[k++] = e[i]!
  return salida
}

// ── Matriz ──────────────────────────────────────────────────────────────────
class Matriz {
  readonly mod: Uint8Array
  readonly fija: Uint8Array
  constructor(readonly lado: number) {
    this.mod = new Uint8Array(lado * lado)
    this.fija = new Uint8Array(lado * lado)
  }
  poner(f: number, c: number, oscuro: boolean, fija = false) {
    const i = f * this.lado + c
    this.mod[i] = oscuro ? 1 : 0
    if (fija) this.fija[i] = 1
  }
}

function posicionesAlineacion(v: number, lado: number): number[] {
  if (v === 1) return []
  const n = Math.floor(v / 7) + 2
  const paso = lado === 145 ? 26 : Math.ceil((lado - 13) / (2 * n - 2)) * 2
  const p = [lado - 7]
  for (let i = 1; i < n - 1; i++) p[i] = p[i - 1]! - paso
  p.push(6)
  return p.reverse()
}

function bch(dato: number, g: number): number {
  const grado = (x: number) => 31 - Math.clz32(x)
  let d = dato << grado(g)
  while (d && grado(d) >= grado(g)) d ^= g << (grado(d) - grado(g))
  return d
}
const G15 = 0b10100110111
const G18 = 0b1111100100101

function formato(m: Matriz, mascara: number) {
  const dato = (NIVEL_M << 3) | mascara
  const bits = ((dato << 10) | bch(dato, G15)) ^ 0b101010000010010
  const n = m.lado
  for (let i = 0; i < 15; i++) {
    const o = ((bits >> i) & 1) === 1
    if (i < 6) m.poner(i, 8, o, true)
    else if (i < 8) m.poner(i + 1, 8, o, true)
    else m.poner(n - 15 + i, 8, o, true)
    if (i < 8) m.poner(8, n - i - 1, o, true)
    else if (i < 9) m.poner(8, 15 - i, o, true)
    else m.poner(8, 15 - i - 1, o, true)
  }
  m.poner(n - 8, 8, true, true)
}

const MASCARAS: Array<(i: number, j: number) => boolean> = [
  (i, j) => (i + j) % 2 === 0,
  (i) => i % 2 === 0,
  (_, j) => j % 3 === 0,
  (i, j) => (i + j) % 3 === 0,
  (i, j) => (Math.floor(i / 2) + Math.floor(j / 3)) % 2 === 0,
  (i, j) => ((i * j) % 2) + ((i * j) % 3) === 0,
  (i, j) => (((i * j) % 2) + ((i * j) % 3)) % 2 === 0,
  (i, j) => (((i * j) % 3) + ((i + j) % 2)) % 2 === 0,
]

function aplicarMascara(m: Matriz, p: number) {
  const f = MASCARAS[p]!
  for (let i = 0; i < m.lado; i++) {
    for (let j = 0; j < m.lado; j++) {
      const k = i * m.lado + j
      if (!m.fija[k] && f(i, j)) m.mod[k] = m.mod[k]! ^ 1
    }
  }
}

/** Las cuatro penalizaciones del estándar: rachas, bloques 2×2, falsos buscadores y balance. */
function penalizacion(m: Matriz): number {
  const n = m.lado
  const at = (f: number, c: number) => m.mod[f * n + c]!
  let p = 0
  for (let f = 0; f < n; f++) {
    let rf = 0, rc = 0, uf = -1, uc = -1
    for (let c = 0; c < n; c++) {
      const a = at(f, c)
      if (a === uf) rf++
      else { if (rf >= 5) p += 3 + rf - 5; uf = a; rf = 1 }
      const b = at(c, f)
      if (b === uc) rc++
      else { if (rc >= 5) p += 3 + rc - 5; uc = b; rc = 1 }
    }
    if (rf >= 5) p += 3 + rf - 5
    if (rc >= 5) p += 3 + rc - 5
  }
  for (let f = 0; f < n - 1; f++) {
    for (let c = 0; c < n - 1; c++) {
      const s = at(f, c) + at(f, c + 1) + at(f + 1, c) + at(f + 1, c + 1)
      if (s === 4 || s === 0) p += 3
    }
  }
  for (let f = 0; f < n; f++) {
    let bf = 0, bc = 0
    for (let c = 0; c < n; c++) {
      bf = ((bf << 1) & 0x7ff) | at(f, c)
      if (c >= 10 && (bf === 0x5d0 || bf === 0x05d)) p += 40
      bc = ((bc << 1) & 0x7ff) | at(c, f)
      if (c >= 10 && (bc === 0x5d0 || bc === 0x05d)) p += 40
    }
  }
  let oscuros = 0
  for (const x of m.mod) oscuros += x
  p += Math.abs(Math.ceil((oscuros * 100) / m.mod.length / 5) - 10) * 10
  return p
}

export interface QR {
  lado: number
  /** 1 oscuro, 0 claro, fila por fila. */
  modulos: Uint8Array
  version: number
  mascara: number
}

/** El QR de un texto, en modo byte y nivel de corrección M. */
export function qr(texto: string): QR {
  const bytes = new TextEncoder().encode(texto)
  const v = version(bytes.length)
  const lado = v * 4 + 17
  const m = new Matriz(lado)

  // Buscadores, con su separador.
  for (const [f0, c0] of [[0, 0], [lado - 7, 0], [0, lado - 7]] as const) {
    for (let r = -1; r <= 7; r++) {
      if (f0 + r < 0 || f0 + r >= lado) continue
      for (let c = -1; c <= 7; c++) {
        if (c0 + c < 0 || c0 + c >= lado) continue
        const oscuro = (r >= 0 && r <= 6 && (c === 0 || c === 6)) || (c >= 0 && c <= 6 && (r === 0 || r === 6)) || (r >= 2 && r <= 4 && c >= 2 && c <= 4)
        m.poner(f0 + r, c0 + c, oscuro, true)
      }
    }
  }
  // Sincronización.
  for (let r = 8; r < lado - 8; r++) {
    m.poner(r, 6, r % 2 === 0, true)
    m.poner(6, r, r % 2 === 0, true)
  }
  // Alineación, salvo donde están los buscadores.
  const pa = posicionesAlineacion(v, lado)
  for (let a = 0; a < pa.length; a++) {
    for (let b = 0; b < pa.length; b++) {
      if ((a === 0 && b === 0) || (a === 0 && b === pa.length - 1) || (a === pa.length - 1 && b === 0)) continue
      for (let r = -2; r <= 2; r++) {
        for (let c = -2; c <= 2; c++) {
          m.poner(pa[a]! + r, pa[b]! + c, r === -2 || r === 2 || c === -2 || c === 2 || (r === 0 && c === 0), true)
        }
      }
    }
  }
  formato(m, 0) // reserva su lugar; el de verdad va al final
  if (v >= 7) {
    const bits = (v << 12) | bch(v, G18)
    for (let i = 0; i < 18; i++) {
      const o = ((bits >> i) & 1) === 1
      const f = Math.floor(i / 3)
      const c = (i % 3) + lado - 11
      m.poner(f, c, o, true)
      m.poner(c, f, o, true)
    }
  }

  // Los datos, en zigzag de a dos columnas, de abajo a la derecha.
  const datos = codewords(bytes, v)
  let inc = -1, f = lado - 1, bit = 7, byte = 0
  for (let c = lado - 1; c > 0; c -= 2) {
    if (c === 6) c--
    for (;;) {
      for (let d = 0; d < 2; d++) {
        if (!m.fija[f * lado + c - d]) {
          m.poner(f, c - d, byte < datos.length && ((datos[byte]! >>> bit) & 1) === 1)
          if (--bit === -1) { byte++; bit = 7 }
        }
      }
      f += inc
      if (f < 0 || f >= lado) { f -= inc; inc = -inc; break }
    }
  }

  let mejor = 0, menor = Infinity
  for (let p = 0; p < 8; p++) {
    formato(m, p)
    aplicarMascara(m, p)
    const pen = penalizacion(m)
    aplicarMascara(m, p)
    if (pen < menor) { menor = pen; mejor = p }
  }
  aplicarMascara(m, mejor)
  formato(m, mejor)
  return { lado, modulos: m.mod, version: v, mascara: mejor }
}

/**
 * El QR para la consola: dos filas por renglón con medios bloques, fondo
 * blanco y un módulo de margen. Es el mismo texto que daba `qrcode` con
 * `{ type: 'terminal', small: true }`.
 */
export function qrTerminal(texto: string): string {
  const { lado, modulos } = qr(texto)
  const fondo = '\x1b[47m\x1b[30m'
  const fin = '\x1b[0m'
  const blanco = '\x1b[37m', negro = '\x1b[30m'
  const pal: Record<string, string> = {
    '00': `${fin} ${fondo}`, '01': `${fin}${blanco}▄${fondo}`, '02': `${fin}${negro}▄${fondo}`,
    '10': `${fin}${blanco}▀${fondo}`, '11': ' ', '12': '▄',
    '20': `${fin}${negro}▀${fondo}`, '21': '▀', '22': '█',
  }
  const px = (x: number, y: number) => {
    if (x >= lado + 1 || y >= lado + 1 || y < -1 || x < -1) return '0'
    if (x >= lado || y >= lado || y < 0 || x < 0) return '1'
    return modulos[y * lado + x] ? '2' : '1'
  }
  let s = fondo
  for (let y = -1; y < lado + 1; y += 2) {
    for (let x = -1; x <= lado; x++) s += pal[px(x, y) + px(x, y + 1)]
    s += `${fin}\n${fondo}`
  }
  return s + fin
}

/** El QR como PNG, negro sobre blanco, con 4 módulos de margen como pide el estándar. */
export async function qrPng(texto: string, escala = 8, margen = 4): Promise<Buffer> {
  const { lado, modulos } = qr(texto)
  const total = (lado + margen * 2) * escala
  const px = Buffer.alloc(total * total, 255)
  for (let f = 0; f < lado; f++) {
    for (let c = 0; c < lado; c++) {
      if (!modulos[f * lado + c]) continue
      for (let dy = 0; dy < escala; dy++) {
        px.fill(0, ((f + margen) * escala + dy) * total + (c + margen) * escala, ((f + margen) * escala + dy) * total + (c + margen + 1) * escala)
      }
    }
  }
  const sharp = (await import('sharp')).default
  return sharp(px, { raw: { width: total, height: total, channels: 1 } }).png().toBuffer()
}
