// Baja el modelo de Cosxamix, preguntando antes.
//
//     npm run cosxamix:model                 elige según la RAM y pregunta
//     npm run cosxamix:model -- --si         sin preguntar
//     npm run cosxamix:model -- --modelo 0.5b
//
// No va en el postinstall a propósito: son de 0,5 a 1,7 GB, y bajar eso sin
// preguntar no es "npm install y nada más", es otra cosa. El postinstall solo
// avisa que falta (ver fetch_cosxamix.js).
//
// Los modelos son los Qwen2.5-Instruct oficiales de Hugging Face, con el
// SHA-256 que publica Hugging Face fijado acá: un archivo que no coincide se
// borra. El tokenizador es el mismo para los tres tamaños, así que se baja uno.
// Van a data/cosxamix/modelos/, que es donde el bot le dice a Cosxamix que
// busque (`COSXAMIX_MODELOS`).
//
// La descarga va por partes: si se corta, la próxima sigue desde donde quedó.

import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream, existsSync, mkdirSync, renameSync, statSync, statfsSync, unlinkSync } from 'node:fs'
import { once } from 'node:events'
import { join } from 'node:path'
import { platform, totalmem } from 'node:os'
import { createInterface } from 'node:readline/promises'
import { pathToFileURL } from 'node:url'

const ROOT = process.cwd()
export const DIR = join(ROOT, 'data', 'cosxamix', 'modelos')
const HF = 'https://huggingface.co'

/**
 * Los modelos, del más grande al más chico. `bytes` y `sha256` son los que
 * publica Hugging Face (comprobados contra copias bajadas antes).
 *
 * El 3B en Q3_K_M es el de siempre de Cosxamix: 10 de 15 preguntas
 * verificables, 363 MB menos que en Q4_K_M y las mismas respuestas.
 */
export const MODELOS = [
  {
    clave: '3b',
    nombre: 'qwen2.5-3b-instruct-q3_k_m',
    url: `${HF}/Qwen/Qwen2.5-3B-Instruct-GGUF/resolve/main/qwen2.5-3b-instruct-q3_k_m.gguf`,
    bytes: 1724178848,
    sha256: 'ba8627a48c2bddefac2f995caf7887551304f26a72137fb94b74449121d0df4e',
  },
  {
    clave: '1.5b',
    nombre: 'qwen2.5-1.5b-instruct-q4_k_m',
    url: `${HF}/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_k_m.gguf`,
    bytes: 1117320736,
    sha256: '6a1a2eb6d15622bf3c96857206351ba97e1af16c30d7a74ee38970e434e9407e',
  },
  {
    clave: '0.5b',
    nombre: 'qwen2.5-0.5b-instruct-q4_k_m',
    url: `${HF}/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/qwen2.5-0.5b-instruct-q4_k_m.gguf`,
    bytes: 491400032,
    sha256: '74a4da8c9fdbcd15bd1f6d01d621410d31c6fc00986f5eb687824e7b93d7a9db',
  },
]

/** El de Qwen2.5, igual para los tres tamaños. No es LFS: su SHA-256 se calculó acá. */
export const TOKENIZADOR = {
  nombre: 'tokenizer.json',
  url: `${HF}/Qwen/Qwen2.5-3B-Instruct/resolve/main/tokenizer.json`,
  bytes: 7031645,
  sha256: 'c0382117ea329cdf097041132f6d735924b697924d6f6fc3945713e96ce87539',
}

/**
 * El más grande que entra. El modelo residente pesa ~1,05 veces el archivo, y
 * se le deja como mucho el 40% de la RAM —el sistema, el bot y la Session API
 * necesitan el resto—, o el 25% en Android, que cierra procesos de fondo con
 * mucha menos memoria ocupada que un escritorio. Con eso un teléfono de 8 GB
 * lleva el 3B y uno de 6 GB el 1.5B: con el 30%, el de 6 GB llevaba el 3B
 * con 120 MB de margen.
 */
export function elegir(ram = totalmem(), android = esAndroid()) {
  const tope = ram * (android ? 0.25 : 0.4)
  return MODELOS.find((m) => m.bytes * 1.05 <= tope) ?? MODELOS[MODELOS.length - 1]
}

function esAndroid() {
  return platform() === 'android' || !!process.env.PREFIX?.includes('com.termux')
}

/** Si ya hay algún modelo de los nuestros con su tokenizador. */
export function hayModelo(dir = DIR) {
  return existsSync(join(dir, TOKENIZADOR.nombre)) && MODELOS.some((m) => existsSync(join(dir, `${m.nombre}.gguf`)))
}

const mb = (b) => (b / 1048576).toFixed(0)
const gb = (b) => (b / 1073741824).toFixed(2).replace('.', ',')

/**
 * Baja `url` a `destino`, por partes, verificando tamaño y SHA-256.
 *
 * Lo bajado se va guardando en `destino.part`. Si existe, se pide el resto con
 * `Range`; si el servidor no lo acepta (responde 200 en vez de 206), se empieza
 * de cero. El hash se calcula mientras se escribe, así que no hay que releer
 * 1,7 GB al final —solo lo que ya estaba de una vez anterior—.
 */
export async function bajarArchivo({ url, bytes, sha256 }, destino, progreso = () => {}) {
  const parte = `${destino}.part`
  let desde = existsSync(parte) ? statSync(parte).size : 0
  if (desde > bytes) { unlinkSync(parte); desde = 0 }

  const hash = createHash('sha256')
  if (desde > 0) for await (const trozo of createReadStream(parte)) hash.update(trozo)

  if (desde < bytes) {
    const r = await fetch(url, { redirect: 'follow', headers: desde ? { Range: `bytes=${desde}-` } : {} })
    if (!r.ok) throw new Error(`HTTP ${r.status} en ${url}`)
    if (desde > 0 && r.status !== 206) {
      // No aceptó el rango y manda el archivo entero: se empieza de cero.
      await r.body?.cancel()
      unlinkSync(parte)
      return bajarArchivo({ url, bytes, sha256 }, destino, progreso)
    }
    const salida = createWriteStream(parte, { flags: desde ? 'a' : 'w' })
    let hecho = desde
    try {
      for await (const trozo of r.body) {
        hash.update(trozo)
        hecho += trozo.length
        if (!salida.write(trozo)) await once(salida, 'drain')
        progreso(hecho, bytes)
      }
    } finally {
      salida.end()
      await once(salida, 'close')
    }
  }

  const tam = statSync(parte).size
  const real = hash.digest('hex')
  if (tam !== bytes || real !== sha256) {
    unlinkSync(parte)
    throw new Error(`no coincide (${tam} bytes, sha256 ${real.slice(0, 16)}…): se borró, probá de nuevo`)
  }
  renameSync(parte, destino)
}

/** Una línea de progreso que se reescribe, una vez por segundo como mucho. */
function barra(etiqueta) {
  let ultimo = 0
  const t0 = Date.now()
  return (hecho, total) => {
    const ahora = Date.now()
    if (ahora - ultimo < 1000 && hecho < total) return
    ultimo = ahora
    const vel = hecho / Math.max(1, (ahora - t0) / 1000)
    const linea = `  ${etiqueta}: ${mb(hecho)}/${mb(total)} MB (${Math.floor((hecho / total) * 100)}%) · ${mb(vel)} MB/s`
    if (process.stdout.isTTY) process.stdout.write(`\r${linea}   `)
    else if (hecho >= total) console.log(linea)
  }
}

async function preguntar(texto) {
  if (!process.stdin.isTTY) return false
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  try {
    return /^s(i|í)?$/i.test((await rl.question(texto)).trim())
  } finally {
    rl.close()
  }
}

function argumentos(argv) {
  const i = argv.indexOf('--modelo')
  return { si: argv.includes('--si'), clave: i >= 0 ? argv[i + 1] : undefined }
}

async function main() {
  const { si, clave } = argumentos(process.argv.slice(2))
  const modelo = clave ? MODELOS.find((m) => m.clave === clave) : elegir()
  if (!modelo) {
    console.log(`  ✖ No conozco el modelo "${clave}". Hay: ${MODELOS.map((m) => m.clave).join(', ')}`)
    process.exitCode = 1
    return
  }

  const destino = join(DIR, `${modelo.nombre}.gguf`)
  const tok = join(DIR, TOKENIZADOR.nombre)
  const falta = [existsSync(destino) ? null : modelo, existsSync(tok) ? null : TOKENIZADOR].filter(Boolean)
  if (!falta.length) {
    console.log(`  ✔ Ya está: ${modelo.nombre}`)
    return
  }

  const total = falta.reduce((a, f) => a + f.bytes, 0)
  console.log(`  ◈ Modelo para Cosxamix: ${modelo.nombre}${clave ? '' : ` (elegido por la RAM: ${gb(totalmem())} GB)`}`)
  console.log(`    ${gb(total)} GB a ${DIR}`)

  mkdirSync(DIR, { recursive: true })
  try {
    const libre = statfsSync(DIR).bavail * statfsSync(DIR).bsize
    if (libre < total * 1.02) {
      console.log(`  ✖ No hay lugar: hacen falta ${gb(total)} GB y quedan ${gb(libre)} GB`)
      process.exitCode = 1
      return
    }
  } catch {} // statfs no está en todos los sistemas de archivos: se sigue

  if (!si && !(await preguntar('    ¿Bajarlo? [s/N] '))) {
    console.log(process.stdin.isTTY ? '  Nada bajado.' : '  Sin terminal para preguntar: agregá --si para bajarlo igual.')
    return
  }

  for (const f of falta) {
    const ruta = join(DIR, f === TOKENIZADOR ? TOKENIZADOR.nombre : `${modelo.nombre}.gguf`)
    await bajarArchivo(f, ruta, barra(f === TOKENIZADOR ? 'tokenizador' : modelo.clave))
    if (process.stdout.isTTY) process.stdout.write('\n')
  }
  console.log(`  ✔ Listo. En el .env: OLLAMA_MODEL=${modelo.nombre}`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    if (process.stdout.isTTY) process.stdout.write('\n')
    console.log(`  ✖ ${e.message}`)
    console.log('    Correlo otra vez: si se cortó la conexión, sigue desde donde quedó.')
    process.exitCode = 1
  })
}
