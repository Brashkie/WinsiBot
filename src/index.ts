import 'dotenv/config'
import { WinsiSocket } from '@core/socket.js'
import { handleMessage } from '@core/handler.js'
import { loadCommands } from '@plugins/commands/index.js'
import { logger } from '@core/logger.js'
import { config } from '@config'
import chalk from 'chalk'

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

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
process.on('SIGINT', () => {
  console.log()
  console.log(`  ${chalk.yellow('◆')} ${chalk.yellow.bold('WinsiBot detenido por el usuario')}`)
  console.log(`  ${chalk.gray('Sesion guardada — puedes reiniciar con npm run monitor')}`)
  console.log()
  import('@plugins/commands/jadibot/serbot.js').then(({ subBots }) => {
    for (const [, bot] of subBots) {
      try {
        bot.sock?.ev?.removeAllListeners()
        bot.sock?.ws?.close()
      } catch {}
    }
  }).catch(() => {}).finally(() => process.exit(0))
})

process.on('SIGTERM', () => {
  console.log()
  console.log(`  ${chalk.yellow('◆')} ${chalk.yellow.bold('WinsiBot detenido (SIGTERM)')}`)
  console.log()
  process.exit(0)
})

// ─── UI ───────────────────────────────────────────────────────────────────────
async function spinner(text: string, ms = 1500) {
  const frames = ['⠋','⠙','⠹','⠸','⠼','⠴','⠦','⠧','⠇','⠏']
  const end = Date.now() + ms
  let i = 0
  while (Date.now() < end) {
    process.stdout.write(`\r  ${chalk.cyan(frames[i++ % frames.length])}  ${chalk.white(text)}`)
    await sleep(80)
  }
  process.stdout.write(`\r  ${chalk.green('✔')}  ${chalk.white(text)}\n`)
}

async function barraProgreso() {
  const fases = [
    { bar: '▓░░░░░░░░░', pct: '15% ', msg: 'Cargando nucleo...' },
    { bar: '▓▓▓░░░░░░░', pct: '35% ', msg: 'Inicializando modulos...' },
    { bar: '▓▓▓▓▓░░░░░', pct: '55% ', msg: 'Conectando servicios...' },
    { bar: '▓▓▓▓▓▓▓░░░', pct: '75% ', msg: 'Cargando plugins...' },
    { bar: '▓▓▓▓▓▓▓▓▓░', pct: '95% ', msg: 'Finalizando inicio...' },
    { bar: '▓▓▓▓▓▓▓▓▓▓', pct: '100%', msg: 'Sistema operativoo......' },
  ]
  for (const fase of fases) {
    process.stdout.write(
      `\r  ${chalk.magenta('𒁈')} ${chalk.cyan('[' + fase.bar + ']')} ${chalk.yellow(fase.pct)}  ${chalk.gray('⟡')} ${chalk.white(fase.msg)}`
    )
    await sleep(300)
  }
  console.log()
}

async function printBanner() {
  console.clear()
  await sleep(100)

  console.log()
  console.log(`  ${chalk.cyan.bold('WinsiBot')} ${chalk.gray('v8.0.0')}`)
  console.log(`  ${chalk.gray('by Hepein Oficial')}`)
  console.log()
  console.log(`  ${chalk.gray('prefix')}   ${chalk.yellow(config.prefix.join(' '))}`)
  console.log(`  ${chalk.gray('env')}      ${config.isDev ? chalk.green('development') : chalk.red('production')}`)
  console.log(`  ${chalk.gray('github')}   ${chalk.blue('github.com/Brashkie')}`)
  console.log()
  console.log(`  ${chalk.gray('─'.repeat(30))}`)
  console.log()

  await barraProgreso()
  console.log()
}

async function printConnected(jid: string, cmdCount: number) {
  const number = jid.replace('@s.whatsapp.net', '').replace(':0', '').replace(/:.*/, '')
  console.log()
  console.log(`  ${chalk.green('◆')} ${chalk.white.bold('Conectado')}`)
  console.log(`  ${chalk.gray('numero')}    ${chalk.cyan('+' + number)}`)
  console.log(`  ${chalk.gray('comandos')}  ${chalk.yellow(cmdCount + ' cargados')}`)
  console.log(`  ${chalk.gray('hora')}      ${chalk.white(new Date().toLocaleTimeString('es-PE'))}`)
  console.log()
  console.log(`  ${chalk.gray('─'.repeat(30))}`)
  console.log()

  const { getPendingCount, getPendingMessages, markPendingProcessed } = await import('@lib/pythonBridge.js')
  let pendingCount = 0
  try {
    pendingCount = await getPendingCount(30)
  } catch {
    pendingCount = 0
  }

  const msgs = [
    { pct: 20,  msg: 'Recuperando sesion...' },
    { pct: 50,  msg: pendingCount > 0
      ? `${pendingCount} mensajes pendientes...`
      : 'Verificando mensajes...' },
    { pct: 80,  msg: 'Procesando...' },
    { pct: 100, msg: pendingCount > 0
      ? `${pendingCount} mensajes recuperados`
      : 'Sin mensajes pendientes' },
  ]

  const barLen = 10
  let msgIdx   = 0

  for (let pct = 1; pct <= 100; pct++) {
    if (msgIdx < msgs.length - 1 && pct >= (msgs[msgIdx + 1]?.pct ?? 101)) {
      msgIdx++
    }
    const filled = Math.floor((pct / 100) * barLen)
    const empty  = barLen - filled
    const bar    = '▓'.repeat(filled) + '░'.repeat(empty)
    const pctStr = String(pct).padStart(3, ' ') + '%'
    const msg    = msgs[msgIdx]?.msg ?? ''

    process.stdout.write(
      `\r  ${chalk.cyan('𒁈')} ${chalk.magenta('[' + bar + ']')} ${chalk.yellow(pctStr)}  ${chalk.gray('⟡')} ${chalk.white(msg)}`
    )

    const delay = pct < 30 ? 60 : pct < 60 ? 35 : pct < 90 ? 20 : 10
    await sleep(delay)
  }

  if (pendingCount > 0) {
    const pending = await getPendingMessages(30).catch(() => [])
    if (pending.length > 0) {
      await markPendingProcessed(pending.map(p => p.id)).catch(() => {})
    }
  }

  console.log()
  console.log()
  console.log(`  ${chalk.gray('─'.repeat(30))}`)
  console.log(`  ${chalk.gray('listo — bot activo')}`)
  console.log()
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  await printBanner()

  await spinner('Cargando comandos...', 1000)
  await loadCommands()

  await spinner('Inicializando Baileys...', 800)
  await spinner('Conectando a WhatsApp...', 1200)

  const winsi = new WinsiSocket()

  // ─── listener de mensajes — registrado una sola vez fuera del ready ─────
  winsi.on('message', (msg, sock) => {
    handleMessage(msg, sock)
  })

  winsi.on('ready', async (sock) => {
    const jid = sock.user?.id ?? ''
    const { commandRegistry } = await import('@plugins/commands/index.js')
    await printConnected(jid, commandRegistry.size)

    // ─── webhook receiver (health endpoint + eventos externos) ───────────
    try {
      const { startWebhookReceiver } = await import('@plugins/webhooks/receiver.js')
      startWebhookReceiver(sock)
    } catch {}

    // ─── restaurar sub-bots ───────────────────────────────────────────────
    try {
      const { restoreSubBots } = await import('@plugins/commands/jadibot/serbot.js')
      await restoreSubBots(sock)
    } catch {}
  })

  winsi.on('closed', () => {
    console.log()
    console.log(`  ${chalk.red('◆')} ${chalk.red.bold('Desconectado definitivamente')}`)
    console.log(`  ${chalk.gray('Borra la carpeta /auth y reinicia para reconectar')}`)
    console.log()
    process.exit(1)
  })

  await winsi.connect()
}

main().catch(err => {
  logger.error({ err }, 'Error fatal')
  process.exit(1)
})