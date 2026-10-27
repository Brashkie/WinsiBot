// Bajar un binario ya compilado de una release de GitHub, con su SHA-256.
//
// Lo usan los dos descargadores del postinstall: `fetch_rust.js` (la Session
// API) y `fetch_cosxamix.js` (el runtime de IA propio). Antes todo esto vivía
// solo en `fetch_rust.js`; con dos binarios, una sola copia de lo que ya costó
// arreglar —Termux no es Linux, el `process.exit()` que rompía npm, escribir a
// un temporal y renombrar— en vez de dos que se separan.

import { createHash } from 'node:crypto'
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { arch, platform } from 'node:os'
import { join } from 'node:path'

/**
 * El target de Rust de esta máquina, o null si no hay binario publicado.
 *
 * Termux informa `android` como plataforma, y su target es el de Android, NO
 * el de Linux: usa la libc Bionic, no glibc. Confundirlos da un binario que
 * descarga bien y no arranca.
 *
 * Lo que cada proyecto publica de más: `macIntel`, binario para Mac Intel —la
 * Session API no, porque `ort` no tiene ONNX Runtime para ese target; Cosxamix
 * sí—, y `winArm`, para Windows en ARM —la Session API sí, Cosxamix no—.
 * Devolver null para lo que no se publica avisa de entrada, en vez de salir a
 * pedir un archivo que nunca va a estar y reportar un 404 que parece una
 * release rota.
 */
export function target({ macIntel = false, winArm = false } = {}, p = platform(), a = arch(), prefijo = process.env.PREFIX) {
  const esAndroid = p === 'android' || !!prefijo?.includes('com.termux')
  if (esAndroid) return a === 'arm64' ? 'aarch64-linux-android' : null
  switch (`${p}-${a}`) {
    case 'win32-x64':    return 'x86_64-pc-windows-msvc'
    case 'win32-arm64':  return winArm ? 'aarch64-pc-windows-msvc' : null
    case 'linux-x64':    return 'x86_64-unknown-linux-gnu'
    case 'linux-arm64':  return 'aarch64-unknown-linux-gnu'
    case 'darwin-arm64': return 'aarch64-apple-darwin'
    case 'darwin-x64':   return macIntel ? 'x86_64-apple-darwin' : null
    default:             return null
  }
}

/**
 * Para abandonar sin romper la instalación.
 *
 * Se lanza en vez de llamar a `process.exit()`, y eso importa: salir de golpe
 * con una petición HTTP todavía en vuelo hace que libuv aborte con
 * `UV_HANDLE_CLOSING` y **código 127**, que npm interpreta como un postinstall
 * fallido y corta la instalación entera.
 */
export class Abandonar extends Error {}

export function salir(motivo) {
  throw new Abandonar(motivo)
}

export async function bajar(url) {
  const r = await fetch(url, { redirect: 'follow' })
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return Buffer.from(await r.arrayBuffer())
}

/** Si ya está instalada esa versión: al lado del binario queda la que se bajó. */
export function yaEsta(dest, exe, version) {
  const marca = join(dest, `${exe}.version`)
  return existsSync(join(dest, exe)) && existsSync(marca) && readFileSync(marca, 'utf8').trim() === version
}

/**
 * Baja `${base}/${nombre}` y su `.sha256`, lo verifica y lo deja en
 * `dest/exe`. Devuelve los bytes que pesa.
 */
export async function instalar({ base, nombre, dest, exe, version }) {
  let bin, suma
  try {
    // El checksum va primero: si la release existe pero está incompleta,
    // mejor enterarse antes de bajar decenas de MB.
    suma = (await bajar(`${base}/${nombre}.sha256`)).toString('utf8').trim().split(/\s+/)[0]
    bin = await bajar(`${base}/${nombre}`)
  } catch (e) {
    salir(`no disponible (${e.message})`)
  }

  const real = createHash('sha256').update(bin).digest('hex')
  if (real !== suma) {
    // Un binario con checksum distinto no se usa y no se deja en disco: puede
    // ser una descarga corrupta, pero también otra cosa.
    salir(`checksum no coincide (esperaba ${suma.slice(0, 16)}…, obtuve ${real.slice(0, 16)}…)`)
  }

  mkdirSync(dest, { recursive: true })
  // A un temporal y renombrar: si el proceso muere a mitad, no queda un
  // ejecutable truncado que después falla de forma confusa.
  const tmp = join(dest, `${exe}.tmp`)
  writeFileSync(tmp, bin)
  if (platform() !== 'win32') chmodSync(tmp, 0o755)
  try {
    renameSync(tmp, join(dest, exe))
  } catch (e) {
    try { unlinkSync(tmp) } catch {}
    salir(`no se pudo instalar (${e.message})`)
  }
  writeFileSync(join(dest, `${exe}.version`), version)
  return bin.length
}
