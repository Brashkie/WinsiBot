#!/usr/bin/env node
// npm run bench:api — cuánta CPU gasta la Session API en cada endpoint que el
// bot llama por mensaje.
//
// Arranca el binario compilado en una carpeta temporal (no toca los datos de
// verdad), le hace N llamadas a cada endpoint con el cliente del bot, y lee la
// CPU que gastó EL PROCESO DE RUST en cada tanda. Es lo que el servidor paga
// por mensaje, con su capa HTTP incluida, que es lo que importa en un teléfono.
//
//   node scripts/bench_api.js [N]        (por defecto 3000)

import { spawn, execSync } from 'child_process'
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { pathToFileURL } from 'url'

const N = Number(process.argv[2] ?? 3000)
const ROOT = process.cwd()
const PORT = 18990
const KEY = '0123456789abcdef0123456789abcdef'
const exe = join(ROOT, 'target', 'release', process.platform === 'win32' ? 'winsibot-session-api.exe' : 'winsibot-session-api')

process.env.SESSION_API_URL = `http://127.0.0.1:${PORT}`
process.env.SESSION_API_KEY = KEY
const dir = mkdtempSync(join(tmpdir(), 'winsi-bench-'))
const api = spawn(exe, [], {
  cwd: dir,
  env: { ...process.env, SESSION_API_PORT: String(PORT), AUTH_DIR: join(dir, 'auth') },
  stdio: 'ignore',
})

const { rustRequest } = await import(pathToFileURL(join(ROOT, 'dist/lib/rustHttp.js')).href)
for (let i = 0; i < 60; i++) {
  try { await rustRequest('GET', '/health/live'); break } catch { await new Promise((r) => setTimeout(r, 250)) }
}

/** CPU total del proceso de Rust, en ms. */
function cpuRust() {
  if (process.platform === 'win32') {
    const s = execSync(`powershell -NoProfile -Command "(Get-Process -Id ${api.pid}).TotalProcessorTime.TotalMilliseconds"`).toString()
    return Number(s.trim().replace(',', '.'))
  }
  const [utime, stime] = execSync(`cat /proc/${api.pid}/stat`).toString().split(' ').slice(13, 15).map(Number)
  return ((utime + stime) * 1000) / 100
}

const textos = ['hola bot como estas', 'jajaja que buena', '#menu', 'alguien juega free fire hoy?', 'eres un idiota', 'mira https://x.y', 'buenas noches a todos', 'te quiero mucho bot']
const casos = [
  ['/nlp/fast', (i) => ['POST', '/nlp/fast', { text: textos[i % 8] + ' ' + i }]],
  ['/rate/check', (i) => ['POST', '/rate/check', { sender: `${i % 500}@s.whatsapp.net` }]],
  ['/ai/observe', (i) => ['POST', '/ai/observe', { sender: `${i % 500}@s.whatsapp.net`, gjid: `${i % 40}@g.us`, text: textos[i % 8] + ' ' + i }]],
  ['/ai/memory/:jid/update', (i) => ['POST', `/ai/memory/${encodeURIComponent(`${i % 500}@s.whatsapp.net`)}/update`, { text: textos[i % 8], intent: 'neutral', is_cmd: false }]],
  ['/antiban/permit', (i) => ['POST', '/antiban/permit', { session: 'bench', jid: `${i % 40}@g.us` }]],
  ['/watchdog/ping', () => ['POST', '/watchdog/ping', {}]],
]

console.log(`\n  ${N} llamadas por endpoint, CPU del proceso de Rust\n`)
for (const [nombre, armar] of casos) {
  for (let i = 0; i < 100; i++) await rustRequest(...armar(i)) // calentar
  const c0 = cpuRust()
  const t0 = performance.now()
  for (let i = 0; i < N; i++) await rustRequest(...armar(i))
  const ms = performance.now() - t0
  const cpu = cpuRust() - c0
  console.log(`  ${nombre.padEnd(26)} ${((cpu / N) * 1000).toFixed(0).padStart(5)} µs de CPU de Rust   ${((ms / N) * 1000).toFixed(0).padStart(5)} µs por llamada`)
}
api.kill()
process.exit(0)
