import 'dotenv/config'
import { spawn, type ChildProcess } from 'child_process'

// ─────────────────────────────────────────────────────────────────────────────
//  supervisor.ts — capa liviana por encima del bot para que sobreviva meses
//  sin intervención manual.
//
//  El bot (dist/index.js) ya se auto-gestiona a sí mismo internamente
//  (Redis/Celery/Rust/Python — ver ensureX() en index.ts), pero nada reinicia
//  al propio proceso Node si crashea o si el event loop se cuelga sin morir.
//  Este proceso resuelve esas dos cosas:
//
//   1. Si el bot termina con código != 0 (crash), lo reinicia con backoff fijo.
//   2. Si el bot sigue "vivo" como proceso pero dejó de mandar heartbeat a
//      Rust (event loop congelado), lo detecta vía GET /watchdog/status
//      (mecanismo que ya existía — ver comentario en index.ts sobre "un
//      monitor externo puede alertar o reiniciar") y fuerza un reinicio.
//
//  No reemplaza nada de cómo index.ts ya supervisa a Redis/Celery/Rust/Python
//  — es una capa por encima, no una reescritura de la orquestación existente.
// ─────────────────────────────────────────────────────────────────────────────

const RUST_URL = process.env.SESSION_API_URL ?? 'http://127.0.0.1:3001'
const RUST_KEY = process.env.RUST_API_KEY ?? ''

const RESTART_BACKOFF_MS = 3_000
const BOOT_GRACE_MS      = 120_000 // no chequear cuelgue hasta que todo el stack tuvo tiempo de arrancar
const HANG_CHECK_MS      = 30_000
const HANG_KILL_GRACE_MS = 5_000   // espera SIGTERM antes de forzar SIGKILL
const HANG_RESTART_COOLDOWN_MS = 5 * 60_000 // no forzar reinicios por cuelgue más seguido que esto

let child:        ChildProcess | null = null
let stopping                          = false
let startedAt                         = 0
let lastHangRestart                   = 0

function startChild(): void {
  startedAt = Date.now()
  child = spawn('node', ['dist/index.js'], { stdio: 'inherit' })

  child.on('exit', (code, signal) => {
    child = null
    if (stopping) return
    console.warn(`[supervisor] bot terminó (code=${code} signal=${signal}) — reiniciando en ${RESTART_BACKOFF_MS / 1000}s`)
    setTimeout(startChild, RESTART_BACKOFF_MS)
  })

  child.on('error', (err) => {
    console.error(`[supervisor] no se pudo iniciar el bot: ${err.message}`)
  })
}

async function isHung(): Promise<boolean> {
  try {
    const res = await fetch(`${RUST_URL}/watchdog/status`, {
      headers: RUST_KEY ? { 'x-api-key': RUST_KEY } : {},
      signal:  AbortSignal.timeout(5_000),
    })
    const data = await res.json() as { watchdog?: { alive?: boolean } }
    return data?.watchdog?.alive === false
  } catch {
    // Rust puede estar caído o todavía arrancando — no concluir cuelgue por esto.
    return false
  }
}

async function checkHang(): Promise<void> {
  if (!child || stopping) return
  if (Date.now() - startedAt < BOOT_GRACE_MS) return
  if (Date.now() - lastHangRestart < HANG_RESTART_COOLDOWN_MS) return

  if (await isHung()) {
    lastHangRestart = Date.now()
    console.warn('[supervisor] bot sin heartbeat — parece colgado, forzando reinicio')
    const dying = child
    dying.kill('SIGTERM')
    setTimeout(() => {
      if (dying.exitCode === null && dying.signalCode === null) {
        try { dying.kill('SIGKILL') } catch {}
      }
    }, HANG_KILL_GRACE_MS)
  }
}

// Ctrl+C llega directo del terminal tanto al supervisor como al hijo (mismo
// grupo de procesos) — solo marcamos stopping y dejamos que el hijo termine
// solo, respetando su prompt interactivo de "¿Deseas salir? (s/n)".
process.on('SIGINT', () => {
  stopping = true
})

process.on('SIGTERM', () => {
  stopping = true
  child?.kill('SIGTERM')
})

console.log('[supervisor] iniciando WinsiBot supervisado...')
startChild()
setInterval(checkHang, HANG_CHECK_MS).unref()
