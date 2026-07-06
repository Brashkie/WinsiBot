import 'dotenv/config'
import readline from 'readline'
import { spawn, type ChildProcess } from 'child_process'
import { join } from 'path'
import { existsSync, readFileSync } from 'fs'
import { createConnection } from 'net'
import { WinsiSocket } from '@core/socket.js'
import { handleMessage, getActiveHandlerCount } from '@core/handler.js'
import { loadCommands } from '@plugins/commands/index.js'
import { logger } from '@core/logger.js'
import { config } from '@config'
import { loadAll, saveAll, startAutoSave } from '@core/persistence.js'
import { color, gradient, loader, ascii, themes, configure, components, BG } from 'ansimax'

themes.use('dracula')
configure({ animationSpeed: 'fast', reducedMotion: false })

// ─── Silenciar logs internos de libsignal (dependencia de Baileys) ──────────
// libsignal llama a console.info/warn/error directo con el objeto de sesión
// completo (o el stack del error) cada vez que una sesión Signal rota o un
// mensaje no se puede descifrar con ninguna sesión conocida — es ruido normal
// del protocolo (sesiones desincronizadas tras reconexiones, mensajes fuera de
// orden, etc.), ya tratado como no-fatal más abajo (unhandledRejection /
// uncaughtException), y no hay flag para desactivarlo desde fuera del paquete.
const NOISY_CONSOLE = [
  'Closing session:',
  'Decrypted message with closed session.',
  'Closing open session in favor of incoming prekey bundle',
]
const NOISY_ERRORS  = ['Failed to decrypt message with any known session', 'Session error:']

const _origConsoleInfo = console.info.bind(console)
console.info = (...args: unknown[]) => {
  if (typeof args[0] === 'string' && NOISY_CONSOLE.some(p => (args[0] as string).startsWith(p))) return
  _origConsoleInfo(...args)
}

const _origConsoleWarn = console.warn.bind(console)
console.warn = (...args: unknown[]) => {
  if (typeof args[0] === 'string' && NOISY_CONSOLE.some(p => (args[0] as string).startsWith(p))) return
  _origConsoleWarn(...args)
}

const _origConsoleError = console.error.bind(console)
console.error = (...args: unknown[]) => {
  if (typeof args[0] === 'string' && NOISY_ERRORS.some(p => (args[0] as string).startsWith(p))) return
  _origConsoleError(...args)
}

// ─── Suprimir errores conocidos de decrypt ────────────────────────────────────
process.on('unhandledRejection', (reason: any) => {
  const msg = reason?.message ?? String(reason)
  if (
    msg.includes('Bad MAC') ||
    msg.includes('decrypt') ||
    msg.includes('Session error') ||
    msg.includes('Failed to decrypt') ||
    msg.includes('Connection Closed') ||
    msg.includes('Connection Lost') ||
    // sub-bot noise — never crash the main process
    msg.includes('SubBot') ||
    msg.includes('subbot') ||
    msg.includes('serbot') ||
    msg.includes('requestPairingCode') ||
    msg.includes('Cannot read properties of null')
  ) return
  logger.error({ reason }, 'Unhandled rejection')
})

process.on('uncaughtException', (err) => {
  const msg = err?.message ?? ''
  const NON_FATAL = [
    'Bad MAC', 'decrypt', 'Session error', 'Connection Closed', 'Connection Lost',
    'ECONNRESET', 'ECONNREFUSED', 'ECONNABORTED', 'ETIMEDOUT', 'ENOTFOUND',
    'EPIPE', 'ENETUNREACH', 'EHOSTUNREACH', 'socket hang up', 'read ECONNRESET',
    'write EPIPE', 'Stream Errored', 'network timeout',
    // sub-bot reconnect failures — isolated per bot, never fatal
    'reconexión falló', 'startSubBot error', 'restore falló',
    'requestPairingCode', 'Cannot read properties of null',
  ]
  if (NON_FATAL.some(e => msg.includes(e))) {
    logger.warn({ msg }, 'Error de red ignorado (no fatal)')
    return
  }
  logger.error({ err }, 'Uncaught exception fatal')
  process.exit(1)
})

// ─── Procesos hijos auto-gestionados (Redis/Celery/Rust/Python) ──────────────
// El bot levanta sus propias dependencias igual que ya hacía con Python — un
// solo árbol de procesos, un solo lugar donde se limpia todo al salir.
const spawnedChildren: ChildProcess[] = []

// Evita que el reinicio automático de Redis/Celery/Rust dispare un respawn
// espurio cuando la muerte del proceso fue provocada por nosotros al apagar.
let _shuttingDown = false

function killSpawnedChildren(): void {
  _shuttingDown = true
  for (const child of spawnedChildren) {
    try { child.kill() } catch {}
  }
}

// ─── Graceful shutdown ────────────────────────────────────────────────────────
function shutdownCleanly(): void {
  console.log()
  console.log(`  ${themes.warning('◆')} ${color.bold(themes.warning('WinsiBot detenido por el usuario'))}`)
  console.log(`  ${color.dim('Guardando datos...')}`)

  killSpawnedChildren()

  saveAll()
    .catch(() => {})
    .finally(() => {
      console.log(`  ${color.dim('Datos guardados — puedes reiniciar con npm run dev')}`)
      console.log()
      import('@plugins/commands/jadibot/serbot.js').then(({ subBots }) => {
        for (const [, bot] of subBots) {
          try { bot.sock?.ev?.removeAllListeners() } catch {}
          try { bot.sock?.ws?.close() }             catch {}
        }
      }).catch(() => {}).finally(() => {
        try { process.stdin.setRawMode(false) } catch {}
        process.exit(0)
      })
    })
}

let _askingExit = false

process.on('SIGINT', () => {
  if (_askingExit) return
  _askingExit = true

  process.stdout.write('\n')
  process.stdout.write(`  ${themes.warning('◆')} ¿Deseas salir? (s/n): `)

  // Sacar stdin de raw mode para que readline pueda leer
  try { process.stdin.setRawMode(false) } catch {}
  process.stdin.resume()
  process.stdin.setEncoding('utf8')

  const rl = readline.createInterface({ input: process.stdin, terminal: false })

  // Sin respuesta en 10s → continuar
  const timer = setTimeout(() => {
    rl.close()
    process.stdout.write('\n')
    console.log(`  ${color.dim('(tiempo agotado — continuando...)')}`)
    _askingExit = false
  }, 10_000)

  rl.once('line', (line) => {
    clearTimeout(timer)
    rl.close()
    const ans = line.trim().toLowerCase()
    if (ans === 's' || ans === 'si' || ans === 'y' || ans === 'yes' || ans === '1') {
      shutdownCleanly()
    } else {
      console.log(`  ${color.dim('Continuando...')}`)
      _askingExit = false
    }
  })
})

process.on('SIGTERM', () => {
  console.log()
  console.log(`  ${themes.warning('◆')} ${color.bold(themes.warning('WinsiBot detenido (SIGTERM)'))}`)
  try { process.stdin.setRawMode(false) } catch {}
  killSpawnedChildren()
  saveAll().catch(() => {}).finally(() => process.exit(0))
})

// ─── Python API auto-arranque ─────────────────────────────────────────────────

let _pythonProc: ChildProcess | null = null

async function isPythonApiUp(): Promise<boolean> {
  try {
    const { default: axios } = await import('axios')
    await axios.get(`${config.pythonApiUrl}/api/v1/health`, { timeout: 2_000 })
    return true
  } catch {
    return false
  }
}

async function waitPythonApi(maxWaitMs = 20_000): Promise<boolean> {
  const deadline = Date.now() + maxWaitMs
  while (Date.now() < deadline) {
    if (await isPythonApiUp()) return true
    await new Promise(r => setTimeout(r, 800))
  }
  return false
}

async function ensurePythonApi(): Promise<void> {
  // Si ya responde, no hacer nada
  if (await isPythonApiUp()) return

  // Buscar el ejecutable de Python del venv
  const venvPython = join(process.cwd(), 'python', 'venv', 'Scripts', 'python.exe')
  const sysPython  = process.platform === 'win32' ? 'python' : 'python3'
  const python     = existsSync(venvPython) ? venvPython : sysPython

  const stopSpin = loader.spin('Iniciando Python API...')

  _pythonProc = spawn(python, [
    '-m', 'uvicorn',
    'api.app:app',
    '--host', '127.0.0.1',
    '--port', '5000',
    '--workers', '1',
    '--log-level', 'warning',
    '--no-access-log',
  ], {
    cwd:   join(process.cwd(), 'python'),
    // 'ignore' descarta stdout/stderr — evita que el pipe buffer se llene y bloquee Python
    stdio: ['ignore', 'ignore', 'ignore'],
  })

  _pythonProc.on('error', (err) => {
    stopSpin(`Python API no pudo iniciar: ${err.message}`, false)
  })

  // Reinicar Python si muere inesperadamente (exit code != 0)
  _pythonProc.on('exit', (code) => {
    if (code !== 0 && code !== null) {
      logger.warn(`Python API terminó con código ${code} — reiniciando en 3s`)
      setTimeout(() => ensurePythonApi().catch(() => {}), 3_000)
    }
  })

  // Esperar hasta que responda (máx 20s)
  const ok = await waitPythonApi(20_000)
  if (ok) {
    stopSpin('Python API lista', true)
  } else {
    stopSpin('Python API tardó demasiado — continuando sin ella', false)
  }
}

// ─── Redis auto-arranque (opcional — sin caché distribuida si no está) ───────

function isPortOpen(port: number, host = '127.0.0.1', timeoutMs = 2_000): Promise<boolean> {
  return new Promise((resolve) => {
    const sock = createConnection({ port, host })
    const done = (ok: boolean) => { sock.destroy(); resolve(ok) }
    sock.once('connect', () => done(true))
    sock.once('error',   () => done(false))
    sock.setTimeout(timeoutMs, () => done(false))
  })
}

function urlPort(url: string, fallback: number): number {
  try { return Number(new URL(url).port) || fallback } catch { return fallback }
}

const REDIS_PORT = urlPort(process.env.REDIS_URL ?? '', 6379)

async function ensureRedis(): Promise<void> {
  if (await isPortOpen(REDIS_PORT)) return

  const stopSpin = loader.spin('Iniciando Redis...')

  const proc = spawn('redis-server', [], { stdio: ['ignore', 'ignore', 'ignore'] })
  spawnedChildren.push(proc)

  proc.on('error', () => {
    stopSpin('Redis no está instalado — se sigue sin caché distribuida', false)
  })

  // Reiniciar Redis si muere inesperadamente (exit code != 0), salvo que
  // el propio bot esté apagándose (killSpawnedChildren ya lo mató a propósito).
  proc.on('exit', (code) => {
    if (!_shuttingDown && code !== 0 && code !== null) {
      logger.warn(`Redis terminó con código ${code} — reiniciando en 3s`)
      setTimeout(() => ensureRedis().catch(() => {}), 3_000)
    }
  })

  const deadline = Date.now() + 4_000
  let up = false
  while (Date.now() < deadline) {
    if (await isPortOpen(REDIS_PORT, '127.0.0.1', 500)) { up = true; break }
    await new Promise(r => setTimeout(r, 300))
  }
  if (up) stopSpin('Redis listo', true)
  else    stopSpin('Redis no disponible — se sigue sin caché distribuida', false)
}

// ─── Celery auto-arranque (worker de tareas en background de Python) ────────

async function ensureCelery(): Promise<void> {
  const venvPython = join(process.cwd(), 'python', 'venv', 'Scripts', 'python.exe')
  const sysPython  = process.platform === 'win32' ? 'python' : 'python3'
  const python     = existsSync(venvPython) ? venvPython : sysPython

  // Pool "prefork" usa multiprocessing al estilo POSIX que Windows maneja mal
  // (WinError 5/6 al azar) — "solo" evita ese bug por completo en Windows.
  const poolArgs = process.platform === 'win32' ? ['--pool=solo'] : ['--concurrency=2']

  const stopSpin = loader.spin('Iniciando Celery...')

  const proc = spawn(python, [
    '-m', 'celery', '-A', 'api.celery_app', 'worker',
    '--loglevel=warning', ...poolArgs,
  ], {
    cwd:   join(process.cwd(), 'python'),
    stdio: ['ignore', 'ignore', 'ignore'],
  })
  spawnedChildren.push(proc)

  let exited = false
  proc.on('error', (err) => {
    exited = true
    stopSpin(`Celery no pudo iniciar: ${err.message}`, false)
  })
  proc.on('exit', (code) => {
    if (!exited && !_shuttingDown && code !== 0 && code !== null) {
      logger.warn(`Celery terminó con código ${code} — reiniciando en 3s`)
      setTimeout(() => ensureCelery().catch(() => {}), 3_000)
    }
    exited = true
  })

  await new Promise(r => setTimeout(r, 3_000))
  if (!exited) stopSpin('Celery listo', true)
}

// ─── Rust Session API auto-arranque ──────────────────────────────────────────

const RUST_URL_FOR_BOOT = process.env.SESSION_API_URL ?? 'http://127.0.0.1:3001'

async function isRustApiUp(): Promise<boolean> {
  try {
    const res = await fetch(`${RUST_URL_FOR_BOOT}/health/live`, { signal: AbortSignal.timeout(2_000) })
    return res.ok
  } catch {
    return false
  }
}

async function ensureRust(): Promise<void> {
  if (await isRustApiUp()) return

  const exeExt    = process.platform === 'win32' ? '.exe' : ''
  const rustDir   = join(process.cwd(), 'rust')
  const exe       = join(rustDir, 'target', 'release', `winsibot-session-api${exeExt}`)
  const hasBinary = existsSync(exe)

  const stopSpin = loader.spin('Iniciando Rust Session API...')

  const proc = hasBinary
    ? spawn(exe, [], { cwd: rustDir, stdio: ['ignore', 'ignore', 'ignore'] })
    : spawn('cargo', ['run', '--release'], { cwd: rustDir, stdio: ['ignore', 'ignore', 'ignore'], shell: process.platform === 'win32' })
  spawnedChildren.push(proc)

  proc.on('error', (err) => {
    stopSpin(`Rust no pudo iniciar: ${err.message}`, false)
  })

  // Reiniciar Rust si muere inesperadamente (exit code != 0), salvo apagado voluntario.
  proc.on('exit', (code) => {
    if (!_shuttingDown && code !== 0 && code !== null) {
      logger.warn(`Rust Session API terminó con código ${code} — reiniciando en 3s`)
      setTimeout(() => ensureRust().catch(() => {}), 3_000)
    }
  })

  // Sin binario compilado, la primera vez puede tardar varios minutos.
  const deadline = Date.now() + (hasBinary ? 15_000 : 180_000)
  let up = false
  while (Date.now() < deadline) {
    if (await isRustApiUp()) { up = true; break }
    await new Promise(r => setTimeout(r, 500))
  }
  if (up) stopSpin('Rust Session API lista', true)
  else    stopSpin('Rust no respondió a tiempo — continuando sin él', false)
}

// ─── Banner ───────────────────────────────────────────────────────────────────
function getBotVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8'))
    return pkg.version ?? '?'
  } catch {
    return '?'
  }
}

function platformLabel(): string {
  return process.platform === 'win32'  ? 'Windows'
       : process.platform === 'linux'  ? 'Linux'
       : process.platform === 'darwin' ? 'macOS'
       : process.platform
}

async function printBanner() {
  console.clear()
  console.log()

  // Título con gradiente — ASCII art si está disponible, fallback a texto
  let title: string
  try {
    title = ascii.banner('WinsiBot', {
      font:    'small',
      colorFn: (t: string) => gradient(t, ['#8be9fd', '#ff79c6', '#bd93f9']),
    })
  } catch {
    title = `  ${gradient('WinsiBot v8.0.0', ['#8be9fd', '#ff79c6', '#bd93f9'])}`
  }
  console.log(title)
  console.log(`  ${color.dim('by Hepein Oficial')}`)
  console.log()

  const badges = [
    components.badge('version',  getBotVersion(),  { labelBg: BG.blue,  valueBg: BG.magenta }),
    components.badge('node',     process.version,  { labelBg: BG.black, valueBg: BG.green }),
    components.badge('platform', platformLabel(),  { labelBg: BG.blue,  valueBg: BG.cyan }),
    components.badge('github',   'Brashkie',        { labelBg: BG.black, valueBg: BG.blue }),
  ].join(' ')
  console.log(`  ${badges}`)
  console.log()
  console.log(`  ${ascii.divider({ width: 30 })}`)
  console.log()

  await loader.progressAnimate(6, 'Iniciando sistema...', { delay: 280 })
  console.log()
}

// ─── Info de conexión ─────────────────────────────────────────────────────────
async function printConnected(jid: string, cmdCount: number) {
  const number = jid.replace('@s.whatsapp.net', '').replace(':0', '').replace(/:.*/, '')

  console.log()
  const connectedBody = [
    `${color.dim('numero')}    ${color.cyan('+' + number)}`,
    `${color.dim('comandos')}  ${themes.warning(String(cmdCount) + ' cargados')}`,
    `${color.dim('hora')}      ${new Date().toLocaleTimeString('es-PE')}`,
  ].join('\n')
  console.log(ascii.box(connectedBody, {
    title:       `${themes.success('◆')} Conectado`,
    titleAlign:  'center',
    borderStyle: 'rounded',
    padding:     1,
  }))
  console.log()

  const { getPendingCount, getPendingMessages, markPendingProcessed } = await import('@lib/pythonBridge.js')

  const stopPending = loader.spin('Verificando mensajes pendientes...')
  let pendingCount = 0
  try {
    pendingCount = await getPendingCount(30)
  } catch {
    pendingCount = 0
  }
  stopPending(
    pendingCount > 0 ? `${pendingCount} mensajes pendientes` : 'Sin mensajes pendientes',
    true,
  )

  if (pendingCount > 0) {
    const pending = await getPendingMessages(30).catch(() => [])
    if (pending.length > 0) {
      await markPendingProcessed(pending.map(p => p.id)).catch(() => {})
    }
  }

  console.log()
  console.log(`  ${color.dim('listo — bot activo')}`)
  console.log()
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  await printBanner()

  // Redis → Celery → Rust → Python, en ese orden porque Celery depende de
  // Redis como broker. El bot levanta sus propias dependencias igual para
  // las cuatro — un solo árbol de procesos, un solo lugar donde se limpian.
  await ensureRedis()
  await ensureCelery()
  await ensureRust()
  await ensurePythonApi()

  const stopData = loader.spin('Cargando datos guardados...')
  await loadAll()
  startAutoSave(30_000)
  stopData('Datos cargados', true)

  const stopLoad = loader.spin('Cargando comandos...')
  await loadCommands()
  stopLoad('Comandos cargados', true)

  const winsi = new WinsiSocket()

  winsi.on('message', (msg, sock) => {
    handleMessage(msg, sock)
  })

  const stopConn = loader.spin('Conectando a WhatsApp...')

  winsi.on('ready', async (sock) => {
    stopConn('WhatsApp conectado', true)
    const jid = sock.user?.id ?? ''
    const { commandRegistry } = await import('@plugins/commands/index.js')
    await printConnected(jid, commandRegistry.size)

    try {
      const { startWebhookReceiver } = await import('@plugins/webhooks/receiver.js')
      startWebhookReceiver(sock)
    } catch {}

    try {
      const { restoreSubBots } = await import('@plugins/commands/jadibot/serbot.js')
      await restoreSubBots(sock)
    } catch {}

    try {
      const { setupBirthdayChecker } = await import('@plugins/commands/general/birthday.js')
      setupBirthdayChecker(sock)
    } catch {}
  })

  winsi.on('closed', () => {
    // 'closed' solo llega por loggedOut (401) o kick de otra sesión (440)
    // — no es un error de red, es que WhatsApp desconectó la sesión intencionalmente.
    console.log()
    console.log(`  ${themes.error('◆')} ${color.bold(themes.error('Sesión cerrada por WhatsApp'))}`)
    console.log(`  ${color.dim('Si fue un logout: borra /auth y reinicia para escanear QR nuevo')}`)
    console.log(`  ${color.dim('Si fue un kick por otra instancia: cierra WhatsApp Web y reinicia')}`)
    console.log()
    saveAll().catch(() => {}).finally(() => process.exit(0))
  })

  try {
    await winsi.connect()
  } catch (err) {
    stopConn('Error al conectar', false)
    throw err
  }
}

// ─── Heartbeat diagnóstico — RAM + event-loop lag cada 60s ───────────────────
// Si el bot deja de responder pero el proceso sigue abierto, este log es la
// forma de distinguir "event loop bloqueado" (lag alto o el log deja de salir)
// de "Baileys perdió la conexión" (el log sigue saliendo normal, lag bajo).
function startHeartbeatLogger(): void {
  const INTERVAL_MS  = 60_000
  const LAG_WARN_MS  = 1_000   // drift > 1s sobre lo esperado = event loop bajo presión
  let expected = Date.now() + INTERVAL_MS

  setInterval(() => {
    const now = Date.now()
    const lag = Math.max(0, now - expected)
    expected  = now + INTERVAL_MS

    const mem = process.memoryUsage()
    const rssMB  = +(mem.rss      / 1024 / 1024).toFixed(1)
    const heapMB = +(mem.heapUsed / 1024 / 1024).toFixed(1)
    const activeHandlers = getActiveHandlerCount()

    if (lag > LAG_WARN_MS) {
      logger.warn({ rssMB, heapMB, lagMs: lag, activeHandlers }, 'Heartbeat — event loop con lag alto')
    } else {
      logger.info({ rssMB, heapMB, lagMs: lag, activeHandlers }, 'Heartbeat — proceso vivo')
    }
  }, INTERVAL_MS).unref()
}

// ─── Watchdog heartbeat — ping a Rust cada 20s ───────────────────────────────
// Si el event loop se congela, los pings dejan de llegar y Rust lo detecta.
// GET /watchdog/status desde un monitor externo puede alertar o reiniciar.
function startWatchdogPing(): void {
  const RUST_URL = process.env.SESSION_API_URL ?? 'http://127.0.0.1:3001'
  const RUST_KEY = process.env.RUST_API_KEY ?? ''
  setInterval(async () => {
    try {
      await fetch(`${RUST_URL}/watchdog/ping`, {
        method:  'POST',
        headers: { 'x-api-key': RUST_KEY, 'Content-Type': 'application/json' },
        body:    '{}',
        signal:  AbortSignal.timeout(2_000),
      })
    } catch { /* silencioso si Rust no está corriendo */ }
  }, 20_000).unref()
}

main().catch(err => {
  logger.error({ err }, 'Error fatal')
  process.exit(1)
})

startWatchdogPing()
startHeartbeatLogger()
