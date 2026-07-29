#!/usr/bin/env node
// npm run setup — instalación completa de primera vez (cross-platform)

import { spawnSync } from 'child_process'
import { existsSync } from 'fs'
import { join }       from 'path'
import readline       from 'readline'

const WIN    = process.platform === 'win32'
// Termux siempre define $PREFIX apuntando a su propio userland — es la forma
// estándar de detectarlo (process.platform no alcanza: reporta 'android' o
// 'linux' según el build de Node, sin garantía).
const TERMUX = !!(process.env.PREFIX && process.env.PREFIX.includes('com.termux'))
const ROOT = process.cwd()
const VENV = join(ROOT, 'python', 'venv')
const VENV_PY = join(VENV, WIN ? 'Scripts/python.exe' : 'bin/python')
const REQS    = join(ROOT, 'python', 'requirements.txt')

// ─── Helpers ─────────────────────────────────────────────────────────────────

const ok   = ()    => process.stdout.write(' ✅\n')
const warn = (msg) => { process.stdout.write(' ⚠️\n'); if (msg) console.warn(`     ${msg}`) }
const fail = (msg) => { process.stdout.write(' ❌\n'); console.error(`\n     ${msg}\n`); process.exit(1) }
const step = (lbl) => process.stdout.write(`  ◈ ${lbl}`)

function run(cmd) {
  return spawnSync(cmd, { shell: true, stdio: 'pipe', encoding: 'utf8' })
}

function ask(q) {
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
    rl.question(q, ans => { rl.close(); resolve(ans.trim()) })
  })
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n  ◈ WinsiBot — Setup inicial\n  ─────────────────────────────────\n')

  // 1. Node.js >= 20
  step('Node.js >= 20 ...')
  if (parseInt(process.versions.node) < 20)
    fail(`Requiere Node 20+, tienes ${process.version}`)
  ok()

  // 2. Python
  step('Python 3.10+ ...')
  const pyR  = run('python --version')
  const pyVer = (pyR.stdout + pyR.stderr).trim()
  if (!pyVer.match(/Python 3\.(1[0-9]|\d{2,})/))
    warn(pyVer ? `${pyVer} — instala 3.10+` : 'no encontrado en PATH')
  else
    ok()

  // 3. Venv
  step('Entorno virtual Python (venv) ...')
  if (!existsSync(VENV)) {
    const r = run(`python -m venv "${VENV}"`)
    if (r.status !== 0) fail(r.stderr.slice(0, 200))
  }
  ok()

  // 4. pip install
  step('Dependencias Python ...')
  if (existsSync(REQS)) {
    const r = run(`"${VENV_PY}" -m pip install -r "${REQS}" --quiet --disable-pip-version-check`)
    if (r.status !== 0) warn(r.stderr.slice(0, 250))
    else ok()
  } else {
    warn('python/requirements.txt no encontrado')
  }

  // 5. npm install
  if (TERMUX) {
    console.log('\n  ℹ️  Termux detectado — better-sqlite3 compila nativo (sin binario para Android).')
    console.log('     Si falta algo: pkg install clang make pkg-config\n')
  }
  step('Dependencias Node.js ...')
  const npmR = run('npm install --prefer-offline --loglevel=error')
  if (npmR.status !== 0) {
    warn(npmR.stderr.slice(0, 200))
    if (TERMUX) console.warn('     (Termux: revisá que estén instalados clang, make y pkg-config — better-sqlite3 los necesita para compilar)')
  } else {
    ok()
  }

  // 6. TypeScript build
  step('Compilar TypeScript ...')
  const tscR = run('npx tsc')
  if (tscR.status !== 0) {
    warn('errores de tipos — revisa con: npm run typecheck')
    const lines = tscR.stdout.split('\n').slice(0, 8).join('\n')
    if (lines.trim()) console.error(lines)
  } else {
    ok()
  }

  // 7. Rust (opcional, pregunta)
  const cargoR = run('cargo --version')
  if (cargoR.status === 0) {
    const estimate = TERMUX ? '10-30+ min en un teléfono, compila DuckDB en C++ desde cero' : 'tarda ~2min'
    const ans = await ask(`\n  ¿Compilar Rust ahora? (${estimate}) [s/N] `)
    if (ans.toLowerCase() === 's') {
      console.log('  ◈ Compilando Rust (cargo build --release)...')
      const r = spawnSync('npm run rust:build', { shell: true, stdio: 'inherit' })
      console.log(r.status === 0 ? '  ✅ Rust compilado.' : '  ⚠️  Rust falló — corre npm run rust:build luego.')
    }
  }

  // ─── Resumen ────────────────────────────────────────────────────────────────

  console.log(`
  ─────────────────────────────────
  ✅ Setup completado.

  Próximos pasos:
    npm run status    → verificar servicios
    npm run qr        → escanear QR (primera conexión)
    npm run dev       → bot en modo desarrollo
    npm run start     → bot en producción
  ─────────────────────────────────
`)
}

main().catch(e => { console.error(e); process.exit(1) })
