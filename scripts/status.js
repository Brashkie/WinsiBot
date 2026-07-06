#!/usr/bin/env node
// npm run status — estado de todos los servicios del bot

import { execSync } from 'child_process'
import { existsSync } from 'fs'
import { join }       from 'path'

const WIN  = process.platform === 'win32'
const ROOT = process.cwd()

const SERVICES = [
  { name: 'Redis',  port: 6379, health: null },
  { name: 'FastAPI', port: 5000, health: 'http://127.0.0.1:5000/health' },
  { name: 'Rust',   port: 3001, health: 'http://127.0.0.1:3001/health/live' },
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

console.log('\n  WinsiBot — Estado de Servicios')
console.log('  ─────────────────────────────────────\n')

for (const svc of SERVICES) {
  let alive, pingStr

  if (svc.name === 'Celery') {
    alive   = celeryAlive()
    pingStr = ''
  } else {
    alive   = portAlive(svc.port)
    pingStr = alive && svc.health ? await healthPing(svc.health) : null
  }

  const dot    = alive ? '🟢' : '🔴'
  const label  = svc.port ? `:${svc.port}` : '     '
  const timing = pingStr ? ` (${pingStr})` : ''
  const status = alive ? `Online${timing}` : 'Offline'
  console.log(`  ${dot}  ${svc.name.padEnd(8)}  ${label.padEnd(6)}  ${status}`)
}

// ─── Bot / Files ──────────────────────────────────────────────────────────────

console.log('\n  ─────────────────────────────────────')

const checks = [
  { label: 'Venv Python', path: join(ROOT, 'python', 'venv'),       missing: 'npm run setup' },
  { label: 'Bot dist/',   path: join(ROOT, 'dist', 'index.js'),     missing: 'npm run build' },
  { label: 'Session',     path: join(ROOT, 'auth', 'creds.json'),   missing: 'npm run qr' },
  { label: 'Rust bin',    path: join(ROOT, 'rust', 'target', 'release'), missing: 'npm run rust:build' },
]

for (const c of checks) {
  const ok = existsSync(c.path)
  console.log(`  ${ok ? '✅' : '❌'}  ${c.label.padEnd(14)} ${ok ? 'OK' : `→ ${c.missing}`}`)
}

console.log(`\n  Node.js   ${process.version}`)
console.log(`  Platform  ${process.platform} (${process.arch})`)
console.log()
