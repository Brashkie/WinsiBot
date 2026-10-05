#!/usr/bin/env node
// npm run tools:build — compila las herramientas de consola a binarios nativos.
//
// Son las dos únicas cosas que quedan en Python: `npm run monitor` (watchdog
// interactivo) y `npm run manage` (CLI de mantenimiento). Nuitka las traduce a
// C y produce un ejecutable que corre **sin Python instalado**, `rich` incluido
// — que es Python puro y no trae ningún `.so` propio.
//
// ── Lo que se deja fuera, y por qué ──────────────────────────────────────────
//
// `--nofollow-import-to` para numpy, scikit-learn y joblib. Los usa el detector
// de anomalías de `ai_brain.py` (IsolationForest), y son 811 MB de fuente entre
// las tres. Sin ellas el binario queda en decenas de MB en vez de cientos, y lo
// único que se pierde es ese detector: `monitor.py` lo arranca en su propio
// try/except y el resto del watchdog sigue igual.
//
// ── Lo que esto NO resuelve ──────────────────────────────────────────────────
//
// Nuitka no cruza plataformas: el binario que sale acá sirve para ESTA. Para
// tener uno de Termux hay que compilarlo en Termux, donde hacen falta Python y
// un compilador — o sea que para el usuario final no cambia nada, porque estas
// dos herramientas son del operador y él nunca las ejecuta. El bot no las
// necesita y nunca las arranca.
//
// Compilar tarda bastante (del orden de 15-20 minutos por herramienta la
// primera vez, que es cuando Nuitka baja su backend de C).

import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { venvPythonPath, systemPython, exeName, IS_WINDOWS } from './_platform.js'

const ROOT   = process.cwd()
const PYDIR  = join(ROOT, 'python')
const SALIDA = join(ROOT, 'python', 'bin')

const HERRAMIENTAS = [
  { nombre: 'monitor', fuente: join('terminal', 'monitor.py') },
  { nombre: 'manage',  fuente: join('terminal', 'manage.py')  },
]

// Las que no se siguen. joblib y sklearn ya se importan dentro de funciones;
// numpy está en el nivel superior de ai_brain.py, así que excluirlo hace que
// ESE módulo no cargue — a propósito.
const EXCLUIR = ['numpy', 'scipy', 'sklearn', 'joblib', 'pandas', 'matplotlib']

function python() {
  const venv = venvPythonPath()
  return existsSync(venv) ? venv : systemPython()
}

const py = python()

// Nuitka tiene que estar en el mismo intérprete que va a compilar.
const check = spawnSync(py, ['-c', 'import nuitka'], { stdio: 'ignore' })
if (check.status !== 0) {
  console.error('\n  ✗ Nuitka no está instalado en ese Python.')
  console.error(`    Instalalo con:  ${py} -m pip install nuitka\n`)
  process.exit(1)
}

mkdirSync(SALIDA, { recursive: true })

console.log('\n  ◈ Compilando las herramientas de consola con Nuitka')
console.log(`    Python:  ${py}`)
console.log(`    Salida:  ${SALIDA}`)
console.log('    Esto tarda; la primera vez Nuitka baja su backend de C.\n')

let fallos = 0

for (const { nombre, fuente } of HERRAMIENTAS) {
  console.log(`  ── ${nombre} ${'─'.repeat(Math.max(0, 50 - nombre.length))}`)
  const t0 = Date.now()

  const args = [
    '-m', 'nuitka',
    '--standalone',
    '--onefile',
    '--assume-yes-for-downloads',
    '--remove-output',
    `--output-dir=${SALIDA}`,
    `--output-filename=${exeName(nombre)}`,
    // Los módulos propios viven en python/, no junto al script.
    `--include-package=ai`,
    `--include-package=session`,
    // `paths` hay que pedirlo a mano: lo importan `ai/` y `session/`, pero
    // Nuitka busca desde el directorio del script (`terminal/`) y ahí no está.
    `--include-module=paths`,
    ...EXCLUIR.map(m => `--nofollow-import-to=${m}`),
    fuente,
  ]

  const r = spawnSync(py, args, { cwd: PYDIR, stdio: 'inherit' })
  const mins = ((Date.now() - t0) / 60000).toFixed(1)

  const destino = join(SALIDA, exeName(nombre))
  if (r.status === 0 && existsSync(destino)) {
    const mb = (statSync(destino).size / 1048576).toFixed(1)
    console.log(`  ✔ ${nombre}: ${mb} MB en ${mins} min\n`)
  } else {
    console.error(`  ✗ ${nombre}: falló tras ${mins} min\n`)
    fallos++
  }
}

if (fallos) {
  console.error(`  ${fallos} de ${HERRAMIENTAS.length} fallaron.\n`)
  process.exit(1)
}

console.log('  Listos. Corren sin Python instalado:')
for (const { nombre } of HERRAMIENTAS) {
  console.log(`    ${IS_WINDOWS ? 'python\\bin\\' : './python/bin/'}${exeName(nombre)}`)
}
console.log()
