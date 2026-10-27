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
//
// Lo de bajar, verificar e instalar está en `prebuilt.js`, que comparte con
// `fetch_cosxamix.js`.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { arch, platform } from 'node:os'
import { Abandonar, instalar, salir, target, yaEsta } from './prebuilt.js'

const ROOT  = process.cwd()
// En bin/, junto a ffmpeg y yt-dlp. Hasta la 8.14.0 iba a rust/target/release,
// mezclado con lo que compila cargo; separados, bajar una release nueva nunca
// pisa una compilación local, que queda en target/ del workspace.
const DEST  = join(ROOT, 'bin')
const REPO  = process.env.WINSIBOT_REPO ?? 'Brashkie/WinsiBot'

/**
 * La versión del BOT, que es la que etiqueta la release.
 *
 * Hasta la 8.14.0 se leía la del crate (5.x), y las releases se etiquetan con
 * la del bot (v8.x): la URL pedía un tag que nunca existió, todas las
 * descargas daban 404, y "npm install y nada más" no bajó el binario ni una
 * vez desde que existe. El 404 se informaba como "no disponible", que es justo
 * lo que se espera ver cuando todavía no hay release, así que no se notó.
 */
function version() {
  const v = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version
  if (!v) throw new Error('no pude leer la versión de package.json')
  return v
}

async function main() {
  if (process.env.WINSIBOT_SKIP_PREBUILT) salir('salteado por WINSIBOT_SKIP_PREBUILT')

  const exe = platform() === 'win32' ? 'winsibot-session-api.exe' : 'winsibot-session-api'
  const v   = version()
  // Al lado del binario queda la versión que se bajó. Antes bastaba con que
  // existiera un binario para no bajar nada, así que actualizar el bot dejaba
  // la API vieja para siempre.
  if (yaEsta(DEST, exe, v)) return

  // Mac Intel no tiene binario publicado (`ort` no encuentra ONNX Runtime para
  // ese target, así que el workflow ni lo intenta); Windows en ARM sí.
  const t = target({ macIntel: false, winArm: true })
  if (!t) salir(`no publicamos binario para ${platform()}-${arch()}`)

  console.log(`  ◈ Bajando binario de Rust v${v} para ${t}...`)
  const bytes = await instalar({
    base: `https://github.com/${REPO}/releases/download/v${v}`,
    nombre: `winsibot-session-api-${t}${platform() === 'win32' ? '.exe' : ''}`,
    dest: DEST,
    exe,
    version: v,
  })
  console.log(`  ✔ Binario listo (${(bytes / 1048576).toFixed(1)} MB) — no hace falta compilar Rust`)
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
