import 'dotenv/config'
import readline from 'readline'
import { WinsiSocket } from '@core/socket.js'
import { handleMessage } from '@core/handler.js'
import { loadCommands } from '@plugins/commands/index.js'
import { logger } from '@core/logger.js'
import { config } from '@config'
import { color, gradient, loader, ascii, themes, configure } from 'ansimax'

themes.use('dracula')
configure({ animationSpeed: 'fast', reducedMotion: false })

// ─── Suprimir errores conocidos de decrypt ────────────────────────────────────
process.on('unhandledRejection', (reason: any) => {
  const msg = reason?.message ?? String(reason)
  if (
    msg.includes('Bad MAC') ||
    msg.includes('decrypt') ||
    msg.includes('Session error') ||
    msg.includes('Failed to decrypt') ||
    msg.includes('Connection Closed') ||
    msg.includes('Connection Lost')
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
  ]
  if (NON_FATAL.some(e => msg.includes(e))) {
    logger.warn({ msg }, 'Error de red ignorado (no fatal)')
    return
  }
  logger.error({ err }, 'Uncaught exception fatal')
  process.exit(1)
})

// ─── Graceful shutdown ────────────────────────────────────────────────────────
function shutdownCleanly(): void {
  console.log()
  console.log(`  ${themes.warning('◆')} ${color.bold(themes.warning('WinsiBot detenido por el usuario'))}`)
  console.log(`  ${color.dim('Sesión guardada — puedes reiniciar con npm run dev')}`)
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
  console.log()
  try { process.stdin.setRawMode(false) } catch {}
  process.exit(0)
})

// ─── Banner ───────────────────────────────────────────────────────────────────
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

  console.log(`  ${color.dim('prefix')}   ${themes.warning(config.prefix.join(' '))}`)
  console.log(`  ${color.dim('env')}      ${config.isDev ? themes.success('development') : themes.error('production')}`)
  console.log(`  ${color.dim('github')}   ${color.blue('github.com/Brashkie')}`)
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
  console.log(`  ${themes.success('◆')} ${color.bold('Conectado')}`)
  console.log(`  ${color.dim('numero')}    ${color.cyan('+' + number)}`)
  console.log(`  ${color.dim('comandos')}  ${themes.warning(String(cmdCount) + ' cargados')}`)
  console.log(`  ${color.dim('hora')}      ${new Date().toLocaleTimeString('es-PE')}`)
  console.log()
  console.log(`  ${ascii.divider({ width: 30 })}`)
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
  })

  winsi.on('closed', () => {
    console.log()
    console.log(`  ${themes.error('◆')} ${color.bold(themes.error('Desconectado definitivamente'))}`)
    console.log(`  ${color.dim('Borra la carpeta /auth y reinicia para reconectar')}`)
    console.log()
    process.exit(1)
  })

  try {
    await winsi.connect()
  } catch (err) {
    stopConn('Error al conectar', false)
    throw err
  }
}

main().catch(err => {
  logger.error({ err }, 'Error fatal')
  process.exit(1)
})
