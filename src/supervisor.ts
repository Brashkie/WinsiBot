import './lib/env.js'
import { config } from '@config'
import { rustRequest } from '@lib/rustHttp.js'
import { type ChildProcess, spawn } from 'child_process'

// ─────────────────────────────────────────────────────────────────────────────
//  supervisor.ts — capa liviana por encima del bot para que sobreviva meses
//  sin intervención manual.
//
//  El bot (dist/index.js) ya se auto-gestiona a sí mismo internamente
//  (la Session API — ver ensureRust() en index.ts), pero nada reinicia
//  al propio proceso Node si crashea o si el event loop se cuelga sin morir.
//  Este proceso resuelve esas dos cosas:
//
//   1. Si el bot termina con código != 0 (crash), lo reinicia con backoff fijo.
//   2. Si el bot sigue "vivo" como proceso pero dejó de mandar heartbeat a
//      Rust (event loop congelado), lo detecta vía GET /watchdog/status
//      (mecanismo que ya existía — ver comentario en index.ts sobre "un
//      monitor externo puede alertar o reiniciar") y fuerza un reinicio.
//
//  No reemplaza nada de cómo index.ts ya supervisa a la Session API — es una
//  capa por encima. Desde la 8.15.0 es además el único supervisor: el de
//  Python (python/terminal/monitor.py) hacía lo mismo y se fue con Python.
// ─────────────────────────────────────────────────────────────────────────────

// La URL y la clave salen de config, por el cliente único (lib/rustHttp.ts).
// Acá se leía RUST_API_KEY, el nombre que se retiró en la 8.12.0:
// /watchdog/status contestaba 401, isHung() lo leía como "no colgado", y la
// detección de cuelgues no funcionó desde entonces.

const RESTART_BACKOFF_MS = 3_000
const BOOT_GRACE_MS      = 120_000 // no chequear cuelgue hasta que todo el stack tuvo tiempo de arrancar
const HANG_CHECK_MS      = 30_000
const HANG_KILL_GRACE_MS = 5_000   // espera SIGTERM antes de forzar SIGKILL
const HANG_RESTART_COOLDOWN_MS = 5 * 60_000 // no forzar reinicios por cuelgue más seguido que esto

// Banderas de V8 para el bot. `--max-semi-space-size=4` es la que importa: la
// generación joven por defecto de Node 24 está pensada para servidores con RAM
// de sobra. Medido con una carga parecida a la del bot —crear, serializar y
// descartar objetos de mensaje—: RAM máxima de 262 a 73 MB, con el mismo CPU y
// el mismo tiempo dentro del ruido. WINSI_NODE_FLAGS las reemplaza.
//
// En Termux se suma un techo para el heap viejo (512 MB): Android mata sin
// aviso al proceso que se pasa, y es mejor que V8 recolecte antes. Lo ponía
// start.sh, que hasta la 8.17.0 lanzaba dist/index.js directo —sin esta capa,
// sin la generación joven chica y sin la detección de cuelgues—.
const EN_TERMUX = !!process.env.TERMUX_VERSION || (process.env.PREFIX ?? '').includes('com.termux')
const NODE_FLAGS = (process.env.WINSI_NODE_FLAGS ?? `--max-semi-space-size=4${EN_TERMUX ? ' --max-old-space-size=512' : ''}`)
  .split(/\s+/).filter(Boolean)

let child:        ChildProcess | null = null
let stopping                          = false
let startedAt                         = 0
let lastHangRestart                   = 0
let reinicios                         = 0

function startChild(): void {
  startedAt = Date.now()
  // El bot sabe si es un reinicio: no borra la pantalla —ahí está por qué se
  // cayó— ni repite la animación de apertura.
  child = spawn('node', [...NODE_FLAGS, 'dist/index.js'], {
    stdio: 'inherit',
    env: { ...process.env, WINSI_REINICIO: String(reinicios) },
  })
  reinicios++

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
    const res = await rustRequest<{ watchdog?: { alive?: boolean; pingCount?: number } }>(
      'GET', '/watchdog/status', undefined, { timeout: 5_000 },
    )
    const data = res.data
    const w = data?.watchdog
    // Solo es un cuelgue si HUBO latidos y dejaron de llegar. "Nunca llegó
    // ninguno" no prueba que el bot esté colgado —puede ser una clave mal
    // puesta, o la API recién reiniciada— y reiniciar el bot no lo arreglaría:
    // entraría en un bucle de reinicios cada 5 minutos.
    return w?.alive === false && (w.pingCount ?? 0) > 0
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

console.log(`[supervisor] iniciando ${config.botName} supervisado...`)
startChild()
setInterval(checkHang, HANG_CHECK_MS).unref()
