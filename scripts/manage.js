#!/usr/bin/env node
// npm run manage — CLI de mantenimiento: diagnóstico y reparación de la sesión.
//
// Hasta la 8.14.0 esto era python/terminal/manage.py, con `rich` y `cbor2`, y
// pedía Python instalado o un ejecutable de 16 MB compilado con Nuitka para
// hacer lo que acá hacen Node —que el bot ya necesita— y dos dependencias que
// el bot ya tiene: `cbor-x` para leer creds y `ansimax` para los colores.
//
// Mismos ocho comandos y MISMO formato de backups —data/session_backups/
// session_<fecha>/ con su checksums.json—, así que los backups que dejó la
// versión de Python se pueden restaurar con esta.
//
//   npm run manage                 menú interactivo
//   npm run manage -- <comando>    directo
//
// Comandos: status diagnose repair reset-signal reset-qr backup restore logs

import './env.js'
import { createHash } from 'crypto'
import { spawn } from 'child_process'
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, unlinkSync, writeFileSync } from 'fs'
import { join } from 'path'
import { createInterface } from 'readline/promises'
import { decode as cborDecode } from 'cbor-x'
import { color } from 'ansimax'

const ROOT       = process.cwd()
const AUTH_DIR   = join(ROOT, process.env.SESSION_PATH?.replace(/^\.\//, '') || 'auth')
const BACKUP_DIR = join(ROOT, 'data', 'session_backups')
const LOG_FILE   = join(ROOT, 'data', 'session_log.json')

const RUST_URL = process.env.SESSION_API_URL ?? 'http://127.0.0.1:3001'
const RUST_KEY = process.env.SESSION_API_KEY ?? ''
const SERVICES = {
  'Session API': `${RUST_URL}/health/live`,
  Webhook:       `http://127.0.0.1:${process.env.WEBHOOK_PORT ?? 4001}/health`,
  Panel:         `http://127.0.0.1:${process.env.DASHBOARD_PORT ?? 4002}/api/health`,
}

// ─── Salida ──────────────────────────────────────────────────────────────────
const out   = (s = '') => console.log(s)
const ok    = (m) => out(`  ${color.green('✔')}  ${m}`)
const warn  = (m) => out(`  ${color.yellow('⚠')}  ${m}`)
const err   = (m) => out(`  ${color.red('✘')}  ${m}`)
const info  = (m) => out(`  ${color.dim('·')}  ${m}`)
const title = (t) => { out(); out(`  ${color.bold(color.cyan(`── ${t} ──`))}`); out() }
const section = (t) => out(`  ${color.bold(t)}`)

let rl = null
const prompt = () => (rl ??= createInterface({ input: process.stdin, output: process.stdout }))
async function confirm(q, def) {
  const a = (await prompt().question(`  ${q} ${def ? '[S/n]' : '[s/N]'} `)).trim().toLowerCase()
  return a ? a.startsWith('s') || a.startsWith('y') : def
}
async function ask(q, def) {
  const a = (await prompt().question(`  ${q} ${color.dim(`(${def})`)} `)).trim()
  return a || def
}

// ─── HTTP ────────────────────────────────────────────────────────────────────
async function http(url, { method = 'GET', body, key } = {}) {
  try {
    const res = await fetch(url, {
      method,
      headers: { 'content-type': 'application/json', ...(key ? { 'x-api-key': key } : {}) },
      body:    body ? JSON.stringify(body) : undefined,
      signal:  AbortSignal.timeout(method === 'GET' ? 3_000 : 15_000),
    })
    return await res.json()
  } catch {
    return null
  }
}
const rust = (method, path, body) => http(`${RUST_URL}${path}`, { method, body, key: RUST_KEY })

// ─── Sesión ──────────────────────────────────────────────────────────────────
function credsFile(base) {
  for (const f of ['creds.cbor', 'creds.json']) if (existsSync(join(base, f))) return join(base, f)
  return null
}

function readCreds(base) {
  const p = credsFile(base)
  if (!p) return null
  try {
    return p.endsWith('.cbor') ? cborDecode(readFileSync(p)) : JSON.parse(readFileSync(p, 'utf8'))
  } catch {
    return null
  }
}

function sessionHealth() {
  if (!existsSync(AUTH_DIR)) return { healthy: false, reason: 'no existe auth/' }
  const files = readdirSync(AUTH_DIR)
  if (!files.length) return { healthy: false, reason: 'auth/ vacío' }
  const p = credsFile(AUTH_DIR)
  if (!p) return { healthy: false, reason: 'falta creds.cbor/creds.json' }
  const d = readCreds(AUTH_DIR)
  if (!d) return { healthy: false, reason: `${p.split(/[\\/]/).pop()} ilegible` }
  for (const k of ['noiseKey', 'signedIdentityKey', 'registrationId']) {
    if (!d[k]) return { healthy: false, reason: `falta el campo '${k}'` }
  }
  if (!d.me?.id) return { healthy: false, reason: "falta 'me.id' (nunca se vinculó)" }
  return { healthy: true, files: files.length, jid: d.me.id, name: d.me.name ?? '' }
}

const phone = (jid) => String(jid).split('@')[0].split(':')[0]

const isSignal = (f) => /^(session|sender-key)-.*\.(json|cbor)$/.test(f)
const signalFiles = () => (existsSync(AUTH_DIR) ? readdirSync(AUTH_DIR).filter(isSignal) : [])

// ─── Log de eventos (data/session_log.json, mismo formato que antes) ─────────
function readLog() {
  try { return JSON.parse(readFileSync(LOG_FILE, 'utf8')) } catch { return [] }
}
function logEvent(event, detail = '', status = 'success') {
  try {
    mkdirSync(join(ROOT, 'data'), { recursive: true })
    const logs = [...readLog(), { event, detail, status, timestamp: new Date().toISOString() }].slice(-100)
    writeFileSync(LOG_FILE, JSON.stringify(logs, null, 2))
  } catch {}
}

// ─── Backups ─────────────────────────────────────────────────────────────────
// Solo se sumarizan los críticos —creds, claves de app-state y pre-keys—, igual
// que la versión de Python: hashear miles de session-* no aporta, se
// renegocian solos.
const isCritical = (f) => /^creds\.(json|cbor)$/.test(f) || /^(app-state-sync-key|pre-key)-.*\.(json|cbor)$/.test(f)
const sha256 = (p) => createHash('sha256').update(readFileSync(p)).digest('hex')

function writeChecksums(dir) {
  const sums = {}
  for (const f of readdirSync(dir).filter(isCritical)) sums[f] = sha256(join(dir, f))
  writeFileSync(join(dir, 'checksums.json'), JSON.stringify(sums, null, 2))
}

function verifyChecksums(dir) {
  let sums
  try { sums = JSON.parse(readFileSync(join(dir, 'checksums.json'), 'utf8')) } catch { return [false, 'sin checksums.json'] }
  if (!Object.keys(sums).length) return [false, 'checksums vacío']
  for (const [f, h] of Object.entries(sums)) {
    if (!existsSync(join(dir, f))) return [false, `falta ${f}`]
    if (sha256(join(dir, f)) !== h) return [false, `checksum distinto: ${f}`]
  }
  return [true, 'ok']
}

const stamp = () => new Date().toISOString().replace(/[-:]/g, '').replace('T', '_').slice(0, 15)

function listBackups() {
  if (!existsSync(BACKUP_DIR)) return []
  return readdirSync(BACKUP_DIR)
    .filter((n) => !n.startsWith('emergency') && statSync(join(BACKUP_DIR, n)).isDirectory())
    .sort()
    .reverse()
}

function backupSession() {
  const h = sessionHealth()
  if (!h.healthy) {
    warn(`Sesión no válida, no se respalda: ${h.reason}`)
    logEvent('backup_skipped', h.reason, 'fail')
    return false
  }
  const dest = join(BACKUP_DIR, `session_${stamp()}`)
  try {
    mkdirSync(BACKUP_DIR, { recursive: true })
    cpSync(AUTH_DIR, dest, { recursive: true })
    writeChecksums(dest)
    const [good, why] = verifyChecksums(dest)
    if (!good) throw new Error(why)
    logEvent('backup', dest)
    ok(`Sesión respaldada ${color.dim(dest.split(/[\\/]/).pop())}`)
    return true
  } catch (e) {
    rmSync(dest, { recursive: true, force: true })
    err(`Backup fallido: ${e.message}`)
    logEvent('backup', e.message, 'fail')
    return false
  }
}

function cleanOldBackups(keep = 5) {
  for (const old of listBackups().slice(keep)) {
    rmSync(join(BACKUP_DIR, old), { recursive: true, force: true })
    info(`Backup viejo eliminado: ${old}`)
  }
}

/** Reemplaza auth/ por `src`; si la sesión resultante no sirve, vuelve atrás. */
function restoreFrom(src) {
  let emergency = null
  try {
    if (existsSync(AUTH_DIR)) {
      emergency = join(BACKUP_DIR, `emergency_${stamp()}`)
      cpSync(AUTH_DIR, emergency, { recursive: true })
      rmSync(AUTH_DIR, { recursive: true, force: true })
    }
    cpSync(src, AUTH_DIR, { recursive: true })
    // El manifiesto es del backup, no de la sesión.
    rmSync(join(AUTH_DIR, 'checksums.json'), { force: true })
    const h = sessionHealth()
    if (h.healthy) return h
    throw new Error(h.reason)
  } catch (e) {
    if (emergency) {
      rmSync(AUTH_DIR, { recursive: true, force: true })
      cpSync(emergency, AUTH_DIR, { recursive: true })
      warn('Revertido al estado anterior')
    }
    err(`Restauración no válida: ${e.message}`)
    logEvent('restore', e.message, 'fail')
    return null
  }
}

function restoreLastValid() {
  for (const b of listBackups()) {
    const [good, why] = verifyChecksums(join(BACKUP_DIR, b))
    if (good) {
      const h = restoreFrom(join(BACKUP_DIR, b))
      if (h) logEvent('restore', b)
      return !!h
    }
    warn(`Backup ${b} descartado: ${why}`)
  }
  return false
}

// ─── Comandos ────────────────────────────────────────────────────────────────
async function cmdStatus() {
  title('Estado de servicios')
  for (const [name, url] of Object.entries(SERVICES)) {
    const d = await http(url, { key: name === 'Session API' ? RUST_KEY : undefined })
    const detail = d ? (d.uptime != null ? `uptime ${d.uptime}s` : d.version ? `v${d.version}` : url) : url
    out(`  ${name.padEnd(12)} ${d ? color.green('online ') : color.red('offline')}  ${color.dim(detail)}`)
  }
  out()
  section('Sesión')
  const h = sessionHealth()
  if (h.healthy) ok(`${h.name} (+${phone(h.jid)}) — ${h.files} archivos en auth/`)
  else err(`Sesión no saludable: ${h.reason}`)
  const s = signalFiles().length
  if (s) info(`${s} archivos Signal (sesiones de cifrado con cada contacto y grupo)`)
  out()
}

async function cmdDiagnose() {
  title('Diagnóstico')
  const issues = []

  section('Sesión local (auth/)')
  const h = sessionHealth()
  if (h.healthy) ok(`credenciales válidas → ${h.name || '?'} (+${phone(h.jid)})`)
  else { err(`credenciales: ${h.reason}`); issues.push(['error', `creds: ${h.reason}`]) }
  if (existsSync(join(AUTH_DIR, 'creds.cbor.bak'))) info('hay creds.cbor.bak (copia de la versión anterior)')
  if (existsSync(AUTH_DIR)) {
    const byPrefix = {}
    for (const f of readdirSync(AUTH_DIR)) {
      const p = f.includes('-') ? f.split('-')[0] : f.split('.')[0]
      byPrefix[p] = (byPrefix[p] ?? 0) + 1
    }
    for (const [p, c] of Object.entries(byPrefix).sort()) out(`    ${color.dim(`${p} × ${c}`)}`)
  }

  out()
  section('Session API')
  const r = await rust('GET', '/health')
  if (r) {
    ok(`online v${r.version ?? '?'}`)
    const mh = await rust('GET', '/healthy?sessionId=main')
    if (mh?.healthy) ok('copia de creds en la API: saludable')
    else if (mh) { warn('copia de creds en la API: dañada o ausente'); issues.push(['warn', 'copia de creds en la API dañada']) }
    if (mh?.lastSnapshot) info(`último snapshot: ${String(mh.lastSnapshot.ts).slice(0, 19)} (${mh.lastSnapshot.sizeBytes} B)`)
    const ab = await rust('GET', '/antiban/status?session=main')
    if (ab?.status) {
      const s = ab.status
      info(`antiban: ${s.ultimoMinuto}/min · ${s.ultimaHora}/h · ${s.ultimas24h}/24h` +
        (s.enfriadaMs ? ` · enfriada ${Math.round(s.enfriadaMs / 1000)}s` : '') +
        (s.contactosEnEspera ? ` · ${s.contactosEnEspera} contactos en espera (463)` : ''))
    }
  } else { warn('Session API offline'); issues.push(['warn', 'Session API offline']) }

  out()
  section('Bot (webhook)')
  const wh = await http(SERVICES.Webhook)
  if (wh) {
    ok(`online · ${wh.connected ? color.green('conectado a WhatsApp') : color.yellow('socket desconectado')}`)
    if (!wh.connected) issues.push(['warn', 'el bot no está conectado a WhatsApp'])
  } else warn('offline (el bot no está corriendo)')

  out()
  section('Backups')
  const bs = listBackups()
  if (bs.length) {
    ok(`${bs.length} backup(s) — el más reciente: ${bs[0]}`)
    for (const b of bs.slice(0, 3)) info(`${existsSync(join(BACKUP_DIR, b, 'checksums.json')) ? '✔' : '?'}  ${b}`)
  } else { warn('sin backups'); issues.push(['warn', 'sin backups']) }

  out()
  section('Eventos recientes')
  for (const e of readLog().slice(-8).reverse()) {
    const line = `${String(e.timestamp).slice(0, 19).replace('T', ' ')}  ${String(e.event).padEnd(20)}  ${String(e.detail ?? '').slice(0, 55)}`
    out(`  ${e.status === 'fail' ? color.red(line) : color.dim(line)}`)
  }

  out()
  if (!issues.length) { ok(color.bold('Sistema saludable')); out(); return }
  section('Problemas detectados')
  for (const [sev, m] of issues) (sev === 'error' ? err : warn)(m)
  out()
  if (await confirm('¿Ejecutar la reparación automática?', true)) await cmdRepair(true)
}

async function cmdRepair(silent = false) {
  if (!silent) title('Reparación')
  const h = sessionHealth()
  if (h.healthy) {
    ok('credenciales válidas — nada que reparar')
    info('Los archivos Signal NO se borran acá: son sesiones de cifrado sanas. Para eso está reset-signal.')
    out()
    return
  }
  warn(`Sesión no válida: ${h.reason}`)
  // El orden importa: lo más reciente primero. La copia de la API se escribe
  // con cada cambio de creds; los backups de acá, solo cuando alguien los pide.
  const rr = await rust('POST', '/recover', { sessionId: 'main' })
  if (rr?.ok) { ok(`Creds recuperadas desde la Session API: ${rr.message ?? ''}`); logEvent('repair', 'session-api') }
  else if (restoreLastValid()) { ok('Sesión restaurada desde el último backup válido'); logEvent('repair', 'backup') }
  else {
    err('Sin copias válidas — hay que escanear QR de nuevo')
    if (await confirm('¿Reset + QR ahora?', false)) return cmdResetQr()
  }
  out()
}

async function cmdResetSignal() {
  title('Limpiar sesiones Signal')
  const files = signalFiles()
  if (!files.length) { ok('No hay archivos Signal'); return }
  info(`${files.length} archivos a eliminar, por ejemplo:`)
  for (const f of files.slice(0, 6)) out(`      ${color.dim(f)}`)
  if (!(await confirm(`¿Eliminar ${files.length} archivos Signal?`, true))) { info('Cancelado'); return }
  const r = await rust('POST', '/sessions/signal/clear')
  if (r?.ok) ok(`La Session API eliminó ${r.deleted} archivos`)
  else {
    let n = 0
    for (const f of files) { try { unlinkSync(join(AUTH_DIR, f)); n++ } catch {} }
    ok(`${n} archivos eliminados (sin la API)`)
  }
  logEvent('reset_signal', `${files.length} archivos Signal`)
  info('WhatsApp las renegocia solo al recibir mensajes')
  out()
}

async function cmdResetQr() {
  title('Reset completo — QR nuevo')
  warn(color.bold('Esto elimina la sesión actual.'))
  info('Vas a tener que escanear el QR desde WhatsApp → Dispositivos vinculados.')
  out()
  if (!(await confirm('¿Confirmar el reset?', false))) { info('Cancelado'); return }
  if (sessionHealth().healthy) { info('Backup de emergencia...'); backupSession() }
  if (existsSync(AUTH_DIR)) { rmSync(AUTH_DIR, { recursive: true, force: true }); ok('auth/ eliminado') }
  if (existsSync(BACKUP_DIR) && (await confirm('¿Eliminar también los backups? (para que nada restaure la sesión vieja)', true))) {
    rmSync(BACKUP_DIR, { recursive: true, force: true })
    ok('Backups eliminados')
  }
  logEvent('reset_qr', 'sesión eliminada para QR nuevo')
  rl?.close()
  out()
  ok('Arrancando el bot para el QR...')
  out()
  spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'dev'], { stdio: 'inherit', shell: process.platform === 'win32' })
}

async function cmdBackup() {
  title('Backup de la sesión')
  if (backupSession()) cleanOldBackups(5)
  out()
}

async function cmdRestore() {
  title('Restaurar desde backup')
  const bs = listBackups().slice(0, 10)
  if (!bs.length) { err('No hay backups'); return }
  bs.forEach((b, i) => {
    const n = readdirSync(join(BACKUP_DIR, b)).length
    const sums = existsSync(join(BACKUP_DIR, b, 'checksums.json')) ? color.green('✔') : color.yellow('?')
    out(`  ${color.dim(String(i + 1).padStart(2))}  ${b.padEnd(28)} ${String(n).padStart(6)} archivos  ${sums}`)
  })
  out()
  const idx = Number(await ask('Número', '1')) - 1
  if (!(idx >= 0 && idx < bs.length)) { err('Número inválido'); return }
  if (!(await confirm(`¿Restaurar ${bs[idx]}?`, true))) { info('Cancelado'); return }
  const h = restoreFrom(join(BACKUP_DIR, bs[idx]))
  if (h) { ok(`Sesión restaurada: ${h.name || '?'} (+${phone(h.jid)})`); logEvent('restore_manual', bs[idx]) }
  out()
}

async function cmdLogs() {
  title('Eventos de sesión')
  const logs = readLog()
  if (!logs.length) { info('Sin eventos'); return }
  for (const e of logs.slice(-30).reverse()) {
    const st = e.status === 'fail' ? color.red('fail') : color.green('ok  ')
    out(`  ${color.dim(String(e.timestamp).slice(0, 19).replace('T', ' '))}  ${String(e.event).padEnd(22)} ${st}  ${color.dim(String(e.detail ?? '').slice(0, 50))}`)
  }
  out()
}

const COMMANDS = [
  ['1', 'status',       'Estado de servicios',           cmdStatus],
  ['2', 'diagnose',     'Diagnóstico',                   cmdDiagnose],
  ['3', 'repair',       'Reparación automática',         () => cmdRepair(false)],
  ['4', 'reset-signal', 'Limpiar sesiones Signal',       cmdResetSignal],
  ['5', 'reset-qr',     'Reset completo + QR nuevo',     cmdResetQr],
  ['6', 'backup',       'Backup de la sesión',           cmdBackup],
  ['7', 'restore',      'Restaurar desde backup',        cmdRestore],
  ['8', 'logs',         'Eventos recientes',             cmdLogs],
]
const find = (a) => COMMANDS.find(([k, c]) => a === k || a === c)?.[3]

async function menu() {
  for (;;) {
    out()
    out(`  ${color.bold(color.cyan('WinsiBot · mantenimiento'))}`)
    out()
    for (const [k, c, label] of COMMANDS) out(`  ${color.yellow(k)}  ${label}  ${color.dim(`(${c})`)}`)
    out(`  ${color.dim('q  salir')}`)
    out()
    const a = (await prompt().question('  Opción: ')).trim().toLowerCase()
    if (['q', 'quit', 'exit', '0', ''].includes(a)) break
    const fn = find(a)
    if (fn) await fn()
    else err(`"${a}" no es una opción`)
  }
}

const arg = process.argv[2]?.toLowerCase()
if (!arg) await menu()
else if (find(arg)) await find(arg)()
else {
  err(`Comando desconocido: ${arg}`)
  for (const [, c, label] of COMMANDS) out(`  ${color.yellow(c.padEnd(14))} ${color.dim(label)}`)
  process.exitCode = 1
}
rl?.close()
