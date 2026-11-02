#!/usr/bin/env node
// Baja yt-dlp a bin/, el ejecutable autónomo de su release oficial.
//
// `#play`, `#ytmp4`, `#tiktok` y compañía descargan con yt-dlp, un programa
// externo como ffmpeg. Hasta la 9.3.0 había que instalarlo a mano, y sin él
// los comandos fallaban con "spawn yt-dlp ENOENT" y sin contestar nada.
//
//     npm run ytdlp:fetch
//
// Es la última release de https://github.com/yt-dlp/yt-dlp, verificada contra
// su SHA2-256SUMS. Correrlo otra vez la actualiza: YouTube cambia seguido y a
// veces una descarga deja de andar hasta la release siguiente.
//
// En Termux no hay ejecutable que sirva —los de Linux piden glibc o musl, y
// Android usa Bionic—: ahí es `pkg install yt-dlp`, que lo pone en el PATH, y
// el bot lo encuentra solo.
//
// No va en el postinstall: son ~18 MB que solo hacen falta para descargar.

import { createHash } from 'node:crypto'
import { chmodSync, mkdirSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { arch, platform } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { bajar } from './prebuilt.js'

const BASE = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download'
const DEST = join(process.cwd(), 'bin')

/** El ejecutable de la release para esta máquina, o null si no hay. */
export function asset(p = platform(), a = arch(), prefijo = process.env.PREFIX) {
  if (p === 'android' || prefijo?.includes('com.termux')) return null
  if (p === 'win32') return { x64: 'yt-dlp.exe', ia32: 'yt-dlp_x86.exe', arm64: 'yt-dlp_arm64.exe' }[a] ?? null
  if (p === 'linux') return { x64: 'yt-dlp_linux', arm64: 'yt-dlp_linux_aarch64' }[a] ?? null
  if (p === 'darwin') return 'yt-dlp_macos'
  return null
}

/** La suma de `nombre` en un SHA2-256SUMS ("<hash>  <archivo>" por línea). */
export function sumaDe(sums, nombre) {
  for (const linea of sums.split('\n')) {
    const [hash, archivo] = linea.trim().split(/\s+/)
    if (archivo === nombre && /^[0-9a-f]{64}$/.test(hash ?? '')) return hash
  }
  return null
}

async function main() {
  const nombre = asset()
  if (!nombre) {
    console.log(
      platform() === 'android' || process.env.PREFIX?.includes('com.termux')
        ? '  yt-dlp: en Termux se instala con `pkg install yt-dlp`'
        : `  yt-dlp: no hay ejecutable publicado para ${platform()}/${arch()}; instálalo con pip o tu gestor de paquetes`,
    )
    return
  }

  const sums = (await bajar(`${BASE}/SHA2-256SUMS`)).toString('utf8')
  const esperada = sumaDe(sums, nombre)
  if (!esperada) throw new Error(`SHA2-256SUMS no trae ${nombre}`)
  const bin = await bajar(`${BASE}/${nombre}`)
  const real = createHash('sha256').update(bin).digest('hex')
  if (real !== esperada) {
    // Un ejecutable con otra suma no se usa ni se deja en disco.
    throw new Error(`checksum no coincide (esperaba ${esperada.slice(0, 16)}…, obtuve ${real.slice(0, 16)}…)`)
  }

  // Con el nombre que busca el bot (ver getYtdlp en src/lib/downloader.ts).
  const exe = platform() === 'win32' ? 'yt-dlp.exe' : 'yt-dlp'
  mkdirSync(DEST, { recursive: true })
  const tmp = join(DEST, `${exe}.tmp`)
  writeFileSync(tmp, bin)
  if (platform() !== 'win32') chmodSync(tmp, 0o755)
  try {
    renameSync(tmp, join(DEST, exe))
  } catch (e) {
    try { unlinkSync(tmp) } catch {}
    throw new Error(`no se pudo instalar en bin/ (${e.message}); si el bot está descargando algo, páralo y vuelve a intentar`)
  }
  console.log(`  ✓ yt-dlp en bin/${exe} (${(bin.length / 1024 / 1024).toFixed(1)} MB, SHA-256 verificado)`)
}

// Solo si se lo ejecuta (npm run ytdlp:fetch); importado desde el test, no baja nada.
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((e) => {
    console.error(`  ✗ yt-dlp: ${e.message}`)
    process.exitCode = 1
  })
}
