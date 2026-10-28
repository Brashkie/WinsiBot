// Baja Cosxamix, el runtime de IA propio, ya compilado para esta plataforma.
//
// Cosxamix (https://github.com/Brashkie/Cosxamix) habla el mismo dialecto que
// Ollama, así que el bot lo usa con tres líneas del .env (ver .env.example).
// Esto es lo que faltaba para que tampoco haya que bajarlo a mano.
//
// **Solo se baja si se va a usar**: desde la 9.0.0 Cosxamix es la IA por
// defecto, así que se baja salvo que el .env apunte a otro lado —Ollama, otra
// máquina—. Sin .env todavía, también: es lo que va a usar. Quien usa Ollama no
// paga ni un byte. Para bajarlo igual: `npm run cosxamix:fetch`.
//
// La versión va fijada en package.json (`config.cosxamix`): cada versión del
// bot sabe con qué Cosxamix se probó. `COSXAMIX_VERSION` la cambia, para
// probar otra.
//
// Igual que `fetch_rust.js`, nunca rompe `npm install`. El modelo (de 0,5 a
// 1,7 GB) NO se baja acá: se avisa que falta, y `npm run cosxamix:model` lo
// baja preguntando (ver cosxamix_model.js).

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { arch, platform } from 'node:os'
import { pathToFileURL } from 'node:url'
import { Abandonar, instalar, salir, target, yaEsta } from './prebuilt.js'
import { hayModelo } from './cosxamix_model.js'

const ROOT = process.cwd()
const DEST = join(ROOT, 'bin')
const REPO = process.env.COSXAMIX_REPO ?? 'Brashkie/Cosxamix'
export const PUERTO = '11435'

/** La versión de Cosxamix que va con este bot. */
export function version(pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')), env = process.env) {
  const v = env.COSXAMIX_VERSION ?? pkg.config?.cosxamix
  if (!v) throw new Error('package.json no dice qué versión de Cosxamix usar (config.cosxamix)')
  return v
}

/**
 * Si se va a usar Cosxamix: un `OLLAMA_URL` sin comentar con el puerto 11435,
 * o ninguno —lo de por defecto desde la 9.0.0—. Se lee a mano y no con un
 * cargador de .env porque esto corre en el postinstall, antes de que haya nada
 * compilado.
 */
export function loUsa(textoEnv) {
  for (const linea of (textoEnv ?? '').split(/\r?\n/)) {
    const m = linea.match(/^\s*OLLAMA_URL\s*=\s*["']?([^"'#\s]+)/)
    if (m) {
      try {
        return new URL(m[1]).port === PUERTO
      } catch {
        return false
      }
    }
  }
  return true
}

/** El nombre del archivo en la release, como lo arma su release.yml. */
export function nombre(v, t) {
  return `cosxamix-${v}-${t}${t.includes('windows') ? '.exe' : ''}`
}

async function main() {
  const siempre = process.argv.includes('--siempre')
  if (!siempre) {
    const env = join(ROOT, '.env')
    if (!loUsa(existsSync(env) ? readFileSync(env, 'utf8') : '')) return // usa Ollama u otro: nada que bajar
  }

  const exe = platform() === 'win32' ? 'cosxamix.exe' : 'cosxamix'
  const v = version()
  if (yaEsta(DEST, exe, v)) return avisarModelo()

  const t = target({ macIntel: true })
  if (!t) salir(`no hay binario para ${platform()}-${arch()}`)

  console.log(`  ◈ Bajando Cosxamix v${v} para ${t}...`)
  const bytes = await instalar({
    base: `https://github.com/${REPO}/releases/download/v${v}`,
    nombre: nombre(v, t),
    dest: DEST,
    exe,
    version: v,
  })
  console.log(`  ✔ Cosxamix listo en bin/ (${(bytes / 1048576).toFixed(1)} MB)`)
  avisarModelo()
}

function avisarModelo() {
  if (!hayModelo()) console.log('  ℹ Cosxamix: falta el modelo. Bajalo con: npm run cosxamix:model')
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    const motivo = e instanceof Abandonar ? e.message : `error inesperado (${e.message})`
    console.log(`  ℹ Cosxamix: ${motivo}`)
    console.log('    Se puede bajar a mano desde https://github.com/Brashkie/Cosxamix/releases')
    process.exitCode = 0
  })
}
