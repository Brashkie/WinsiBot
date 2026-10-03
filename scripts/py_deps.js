#!/usr/bin/env node
// npm run py:deps — comprueba que lo que python/ importa esté declarado.
//
// Existe porque los requirements se habían ido quedando atrás sin que nadie lo
// notara: declaraban 7 paquetes mientras el código importaba 13 más (spacy,
// torch, pillow, psutil, rich, joblib...). Nadie se enteraba porque el venv de
// desarrollo se fue armando a mano a lo largo de meses, así que ahí todo
// estaba; un `pip install -r requirements.txt` limpio —el de cualquiera que
// clone el repo— dejaba a Python sin poder servir casi ningún endpoint.
//
// Un linter no detecta esto: los imports son válidos y el paquete está
// instalado en la máquina donde se corre. Lo que falla es el contrato entre el
// código y el archivo que dice cómo instalarlo, y eso hay que compararlo a
// propósito.
//
// Sale con código 1 si encuentra algo sin declarar, para poder encadenarlo.

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { color } from 'ansimax'

const RAIZ   = process.cwd()
const PYDIR  = join(RAIZ, 'python')
const REQS   = ['requirements.txt', 'requirements-optional.txt', 'requirements-dev.txt']

// Módulos que se importan sin prefijo de paquete porque python/ y python/api
// están en sys.path. No son paquetes de pip.
const LOCALES = new Set([
  'ai', 'api', 'data', 'ml', 'session', 'terminal', 'cython_ext',
  'routers', 'middleware', 'sqlalchemy_models',
  // Extensiones Cython compiladas (npm run cython:build), no vienen de pip.
  'fast_utils', 'fast_ml', 'spam_guard',
])

// Nombre del import → nombre en PyPI, cuando no coinciden.
const ALIAS = {
  sklearn:  'scikit-learn',
  PIL:      'pillow',
  imgutils: 'dghs-imgutils',
  cv2:      'opencv-python',
  yaml:     'pyyaml',
  dotenv:   'python-dotenv',
  // starlette llega como dependencia de fastapi; declararla aparte sería
  // fijar una versión que fastapi ya elige.
  starlette: 'fastapi',
  Cython:    'cython',
}

// La biblioteca estándar, para no reportarla. No hay forma de preguntárselo a
// Node, así que va la lista de los módulos que este proyecto usa de verdad —
// cualquier otro aparecería como no declarado y se agrega acá si toca.
const STDLIB = new Set([
  '__future__', 'abc', 'argparse', 'ast', 'asyncio', 'base64', 'collections',
  'contextlib', 'csv', 'ctypes', 'dataclasses', 'datetime', 'enum', 'functools',
  'glob', 'gzip', 'hashlib', 'hmac', 'http', 'importlib', 'inspect', 'io',
  'itertools', 'json', 'logging', 'math', 'multiprocessing', 'os', 'pathlib',
  'pickle', 'platform', 'queue', 'random', 're', 'secrets', 'shutil', 'signal',
  'socket', 'sqlite3', 'statistics', 'string', 'struct', 'subprocess', 'sys',
  'tempfile', 'textwrap', 'threading', 'time', 'traceback', 'types', 'typing',
  'unicodedata', 'urllib', 'uuid', 'warnings', 'zipfile', 'zlib',
])

// ── Imports reales ───────────────────────────────────────────────────────────
// Se leen con expresiones regulares y no con un parser de Python: alcanza y
// sobra para `import x` / `from x import y`, que es como se escriben los
// imports en este proyecto. Los relativos (`from .x import`) se saltan.
const RE_IMPORT = /^[ \t]*import[ \t]+([A-Za-z_][\w.]*)/gm
const RE_FROM   = /^[ \t]*from[ \t]+([A-Za-z_][\w.]*)[ \t]+import/gm

function archivosPy(dir) {
  const salida = []
  for (const nombre of readdirSync(dir)) {
    if (nombre === 'venv' || nombre === '.venv' || nombre === '__pycache__') continue
    const ruta = join(dir, nombre)
    if (statSync(ruta).isDirectory()) salida.push(...archivosPy(ruta))
    else if (nombre.endsWith('.py')) salida.push(ruta)
  }
  return salida
}

const usos = new Map()   // paquete → Set(archivos)
for (const ruta of archivosPy(PYDIR)) {
  const src = readFileSync(ruta, 'utf8')
  const rel = relative(RAIZ, ruta).split(sep).join('/')
  for (const re of [RE_IMPORT, RE_FROM]) {
    for (const m of src.matchAll(re)) {
      const top = m[1].split('.')[0]
      if (STDLIB.has(top) || LOCALES.has(top)) continue
      if (!usos.has(top)) usos.set(top, new Set())
      usos.get(top).add(rel)
    }
  }
}

// ── Declarados ───────────────────────────────────────────────────────────────
const declarados = new Map()   // paquete → archivo donde se declara
for (const req of REQS) {
  const ruta = join(PYDIR, req)
  if (!existsSync(ruta)) continue
  for (const linea of readFileSync(ruta, 'utf8').split('\n')) {
    const l = linea.trim()
    if (!l || l.startsWith('#') || l.startsWith('-r')) continue
    const nombre = l.split(/[>=<;[]/)[0].trim().toLowerCase()
    if (nombre) declarados.set(nombre, req)
  }
}

// ── Informe ──────────────────────────────────────────────────────────────────
const faltan = []
const sobran = []

for (const [top, archivos] of [...usos].sort()) {
  const dist = (ALIAS[top] ?? top).toLowerCase()
  if (!declarados.has(dist)) faltan.push({ top, dist, archivos: [...archivos].sort() })
}

const usadosDist = new Set([...usos.keys()].map(t => (ALIAS[t] ?? t).toLowerCase()))
for (const [dist, req] of declarados) {
  // ruff, Cython y setuptools son herramientas: se invocan, no se importan
  // desde el código del bot (salvo cython_ext/setup.py, que sí lo hace).
  if (['ruff'].includes(dist)) continue
  if (!usadosDist.has(dist)) sobran.push({ dist, req })
}

console.log(`\n  ${color.bold('Dependencias de Python')}  ${color.dim(`${usos.size} paquetes importados · ${declarados.size} declarados`)}\n`)

if (faltan.length) {
  console.log(`  ${color.red(color.bold('Importados y NO declarados:'))}`)
  for (const f of faltan) {
    const alias = f.dist === f.top ? '' : color.dim(` (en PyPI: ${f.dist})`)
    console.log(`    ${color.red('x')} ${color.bold(f.top)}${alias}`)
    console.log(`      ${color.dim(f.archivos.join(', '))}`)
  }
  console.log()
}

if (sobran.length) {
  console.log(`  ${color.yellow(color.bold('Declarados sin un solo import:'))}`)
  for (const s of sobran) console.log(`    ${color.yellow('-')} ${s.dist} ${color.dim(`(${s.req})`)}`)
  console.log()
}

if (!faltan.length && !sobran.length) {
  console.log(`  ${color.green('Todo cuadra')} — cada import tiene su declaración y al revés.\n`)
}

process.exit(faltan.length ? 1 : 0)
