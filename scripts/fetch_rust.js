#!/usr/bin/env node
// Baja el binario de Rust ya compilado para esta plataforma, si lo hay.
//
// Corre solo en `postinstall`, así que para quien clona el repo el flujo pasa
// de esto:
//
//     npm install
//     npm run rust:build     ← 4 minutos compilando, y hace falta Rust instalado
//     npm start
//
// a esto:
//
//     npm install            ← baja el binario, ~10 segundos
//     npm start
//
// Nunca falla la instalación: si no hay binario para esta plataforma, si no hay
// red, o si el usuario prefiere compilar, se sale en silencio con una línea que
// dice qué hacer. Compilar desde fuente sigue funcionando igual que siempre.
//
// Para saltárselo a propósito: WINSIBOT_SKIP_PREBUILT=1 npm install

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, writeFileSync, chmodSync, renameSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { arch, platform } from 'node:os'
import { readFileSync } from 'node:fs'

const ROOT  = process.cwd()
const DEST  = join(ROOT, 'rust', 'target', 'release')
const REPO  = process.env.WINSIBOT_REPO ?? 'Brashkie/WinsiBot'

/** Target de Rust para esta máquina, o null si no lo publicamos. */
function target() {
  const a = arch()
  // Termux informa `android` como plataforma, y su target es el de Android,
  // NO el de Linux: usa la libc Bionic, no glibc. Confundirlos da un binario
  // que descarga bien y no arranca.
  const esAndroid = platform() === 'android' || !!process.env.PREFIX?.includes('com.termux')

  if (esAndroid) return a === 'arm64' ? 'aarch64-linux-android' : null
  switch (`${platform()}-${a}`) {
    case 'win32-x64':   return 'x86_64-pc-windows-msvc'
    case 'win32-arm64': return 'aarch64-pc-windows-msvc'
    case 'linux-x64':   return 'x86_64-unknown-linux-gnu'
    case 'linux-arm64': return 'aarch64-unknown-linux-gnu'
    case 'darwin-arm64':return 'aarch64-apple-darwin'
    // Mac Intel no tiene binario publicado, y es a propósito: `ort` no
    // encuentra build de ONNX Runtime para ese target, así que el workflow ni
    // lo intenta. Devolver null acá —en vez del nombre del target— hace que se
    // avise de entrada, en lugar de salir a pedir un archivo que nunca va a
    // estar y reportar un 404, que parecería una release rota.
    case 'darwin-x64':  return null
    default:            return null
  }
}

/** La versión del crate, que es la que etiqueta la release. */
function version() {
  const toml = readFileSync(join(ROOT, 'rust', 'Cargo.toml'), 'utf8')
  const m = toml.match(/^version\s*=\s*"([^"]+)"/m)
  if (!m) throw new Error('no pude leer la versión de rust/Cargo.toml')
  return m[1]
}

/**
 * Se usa para abandonar sin romper la instalación.
 *
 * Lanza en vez de llamar a `process.exit()`, y eso importa: salir de golpe con
 * una petición HTTP todavía en vuelo hace que libuv aborte con
 * `UV_HANDLE_CLOSING` y **código 127**, que npm interpreta como un postinstall
 * fallido y corta la instalación entera. Comprobado: pasaba en el camino del
 * 404, que es justo el más común mientras no haya release publicada.
 */
class Abandonar extends Error {}

function salir(motivo) {
  throw new Abandonar(motivo)
}

async function bajar(url) {
  const r = await fetch(url, { redirect: 'follow' })
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return Buffer.from(await r.arrayBuffer())
}

async function main() {
  if (process.env.WINSIBOT_SKIP_PREBUILT) salir('salteado por WINSIBOT_SKIP_PREBUILT')

  const exe = platform() === 'win32' ? 'winsibot-session-api.exe' : 'winsibot-session-api'
  if (existsSync(join(DEST, exe))) {
    // Ya hay uno, sea bajado o compilado. No se pisa: puede ser una
    // compilación local con cambios que el binario publicado no tiene.
    return
  }

  const t = target()
  if (!t) salir(`no publicamos binario para ${platform()}-${arch()}`)

  const v    = version()
  const base = `https://github.com/${REPO}/releases/download/v${v}`
  const nombre = `winsibot-session-api-${t}${platform() === 'win32' ? '.exe' : ''}`

  console.log(`  ◈ Bajando binario de Rust v${v} para ${t}...`)

  let bin, suma
  try {
    // El checksum va primero: si la release existe pero está incompleta,
    // mejor enterarse antes de bajar 30 MB.
    suma = (await bajar(`${base}/${nombre}.sha256`)).toString('utf8').trim().split(/\s+/)[0]
    bin  = await bajar(`${base}/${nombre}`)
  } catch (e) {
    salir(`no disponible (${e.message})`)
  }

  const real = createHash('sha256').update(bin).digest('hex')
  if (real !== suma) {
    // Un binario con checksum distinto no se usa y no se deja en disco: puede
    // ser una descarga corrupta, pero también otra cosa.
    salir(`checksum no coincide (esperaba ${suma.slice(0, 16)}…, obtuve ${real.slice(0, 16)}…)`)
  }

  mkdirSync(DEST, { recursive: true })
  // Se escribe a un temporal y se renombra: si el proceso muere a mitad, no
  // queda un ejecutable truncado que después falla de forma confusa.
  const tmp = join(DEST, `${exe}.tmp`)
  writeFileSync(tmp, bin)
  if (platform() !== 'win32') chmodSync(tmp, 0o755)
  try {
    renameSync(tmp, join(DEST, exe))
  } catch (e) {
    try { unlinkSync(tmp) } catch {}
    salir(`no se pudo instalar (${e.message})`)
  }

  console.log(`  ✔ Binario listo (${(bin.length / 1048576).toFixed(1)} MB) — no hace falta compilar Rust`)
}

main().catch((e) => {
  // En gris y sin ruido: esto no es un error, es una optimización que no se
  // pudo aplicar. Quien instala necesita saber qué hacer, no asustarse — y
  // sobre todo, `npm install` tiene que terminar bien.
  const motivo = e instanceof Abandonar ? e.message : `error inesperado (${e.message})`
  console.log(`  ℹ Binario de Rust: ${motivo}`)
  console.log('    Compilalo cuando quieras con: npm run rust:build')
  process.exitCode = 0
})
