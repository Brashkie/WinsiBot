#!/usr/bin/env node
// npm run status — estado de todos los servicios del bot

import 'dotenv/config'
import { execSync } from 'child_process'
import { existsSync } from 'fs'
import { join }       from 'path'
import { ascii, color, themes } from 'ansimax'

const WIN  = process.platform === 'win32'
const ROOT = process.cwd()

// Puertos leídos de .env — antes estaban hardcodeados (Rust en 3001), pero
// el puerto real configurado (SESSION_API_URL/RUST_API_URL) es 18080 desde
// hace rato. Con el valor viejo, este chequeo siempre marcaba Rust como
// caído aunque estuviera corriendo perfectamente.
const RUST_URL = process.env.SESSION_API_URL ?? process.env.RUST_API_URL ?? 'http://127.0.0.1:18080'
const RUST_PORT = Number(new URL(RUST_URL).port) || 18080
const PY_URL  = process.env.PYTHON_API_URL ?? 'http://127.0.0.1:5000'
const PY_PORT = Number(new URL(PY_URL).port) || 5000

const SERVICES = [
  { name: 'Redis',  port: 6379, health: null },
  { name: 'FastAPI', port: PY_PORT, health: `${PY_URL}/health` },
  { name: 'Rust',   port: RUST_PORT, health: `${RUST_URL}/health/live` },
  { name: 'Celery', port: null, health: null },
]

function portAlive(port) {
  try {
    const cmd = WIN
      ? `netstat -ano | findstr :${port}`
      : `lsof -ti:${port}`
    const out = execSync(cmd, { timeout: 2_000, stdio: 'pipe' }).toString()
    return out.trim().length > 0
  } catch {
    return false
  }
}

async function healthPing(url) {
  try {
    const t0 = Date.now()
    const r  = await fetch(url, { signal: AbortSignal.timeout(1_200) })
    return r.ok ? `${Date.now() - t0}ms` : null
  } catch {
    return null
  }
}

function celeryAlive() {
  try {
    const cmd = WIN ? 'tasklist | findstr celery' : 'pgrep -f "celery worker"'
    const out = execSync(cmd, { timeout: 2_000, stdio: 'pipe' }).toString()
    return out.trim().length > 0
  } catch {
    return false
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

console.log(`\n  ${color.bold('WinsiBot — Estado de Servicios')}\n`)

const serviceRows = [['Servicio', 'Puerto', 'Estado']]
for (const svc of SERVICES) {
  let alive, pingStr

  if (svc.name === 'Celery') {
    alive   = celeryAlive()
    pingStr = ''
  } else {
    alive   = portAlive(svc.port)
    pingStr = alive && svc.health ? await healthPing(svc.health) : null
  }

  const timing = pingStr ? ` (${pingStr})` : ''
  const status = alive ? themes.success(`Online${timing}`) : themes.error('Offline')
  serviceRows.push([svc.name, svc.port ? `:${svc.port}` : '—', status])
}

console.log(ascii.table(serviceRows, {
  align:       ['left', 'left', 'left'],
  borderStyle: 'rounded',
}))

// ─── Bot / Files ──────────────────────────────────────────────────────────────

console.log()

const checks = [
  { label: 'Venv Python', paths: [join(ROOT, 'python', 'venv')],       missing: 'npm run setup' },
  { label: 'Bot dist/',   paths: [join(ROOT, 'dist', 'index.js')],     missing: 'npm run build' },
  // La sesión puede vivir en creds.json o creds.cbor — ver authStateCbor.ts
  { label: 'Session',     paths: [join(ROOT, 'auth', 'creds.json'), join(ROOT, 'auth', 'creds.cbor')], missing: 'npm run qr' },
  { label: 'Rust bin',    paths: [join(ROOT, 'rust', 'target', 'release')], missing: 'npm run rust:build' },
]

const checkRows = [['Chequeo', 'Estado']]
for (const c of checks) {
  const ok = c.paths.some(p => existsSync(p))
  checkRows.push([c.label, ok ? themes.success('OK') : themes.error(`Falta → ${c.missing}`)])
}

console.log(ascii.table(checkRows, {
  align:       ['left', 'left'],
  borderStyle: 'rounded',
}))

console.log(`\n  Node.js   ${process.version}`)
console.log(`  Platform  ${process.platform} (${process.arch})`)
console.log()
