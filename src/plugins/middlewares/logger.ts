import type { BotContext } from '../../types/index.js'
import chalk from 'chalk'
import moment from 'moment-timezone'
import { getOrCreateUser, logMessage } from '@lib/pythonBridge.js'
import { pythonPost } from '@lib/pythonBridge.js'
import { randomUUID } from 'crypto'
import { config } from '@config'

type ChalkBg = (text: string) => string

function formatJid(jid: string): string {
  return jid.replace('@s.whatsapp.net', '').replace('@g.us', '')
}

function getMsgTypeLabel(ctx: BotContext): string {
  const m = ctx.msg.message
  if (!m)                return 'MEDIA'
  if (m.imageMessage)    return 'IMAGE'
  if (m.videoMessage)    return 'VIDEO'
  if (m.audioMessage)    return 'AUDIO'
  if (m.stickerMessage)  return 'STICKER'
  if (m.documentMessage) return 'DOC'
  return 'TEXT'
}

function getTypeColor(type: string): string {
  const colors: Record<string, ChalkBg> = {
    IMAGE:   chalk.bgMagenta.black,
    VIDEO:   chalk.bgRed.black,
    AUDIO:   chalk.bgYellow.black,
    STICKER: chalk.bgCyan.black,
    DOC:     chalk.bgGray.black,
    TEXT:    chalk.bgBlueBright.black,
    MEDIA:   chalk.bgGray.black,
  }
  return (colors[type] ?? chalk.bgBlueBright.black)(` ${type} `)
}

export async function loggerMiddleware(ctx: BotContext): Promise<boolean> {
  const time  = moment().tz('America/Lima').format('HH:mm:ss')
  const isCmd = config.prefix.some(p => ctx.text.startsWith(p))
  const type  = getMsgTypeLabel(ctx)
  const line  = chalk.gray('━'.repeat(50))

  const header = `
${line}
 ${chalk.cyan.bold('(つ▀¯▀)つ')} ${chalk.white.bold('WINSIBOT v8')} ${chalk.cyan.bold('(つ▀¯▀)つ')}
 ${chalk.white('❖')} ${chalk.white.bold('Hora:')}     ${chalk.bgGreen.black(` ${time} `)}
 ${chalk.white('❖')} ${chalk.white.bold('Usuario:')} ${chalk.cyan(ctx.pushName)} ${chalk.gray('(' + formatJid(ctx.sender) + ')')}
 ${chalk.white('❖')} ${chalk.white.bold('Chat:')}     ${ctx.isGroup ? chalk.magenta('Grupo') : chalk.yellow('Privado')} ${chalk.gray(formatJid(ctx.jid))}
 ${chalk.white('❖')} ${chalk.white.bold('Texto:')}    ${chalk.white(ctx.text.slice(0, 60))}${ctx.text.length > 60 ? chalk.gray('...') : ''}
 ${chalk.white('❖')} ${chalk.white.bold('Tipo:')}     ${getTypeColor(type)} ${isCmd ? chalk.bgMagenta.white(` CMD: ${ctx.command} `) : ''}
 ${chalk.white('❖')} ${chalk.white.bold('Owner:')}    ${ctx.isOwner ? chalk.green('✔ Si') : chalk.red('✗ No')}
${line}`

  // imprimir header — sincrono, sin await
  console.log(header)

  // ─── todo lo demas es fire and forget — no bloquear el handler ────────────
  setImmediate(() => {
    const msgId = randomUUID()

    // registrar usuario en background
    getOrCreateUser(ctx.sender, ctx.pushName, ctx.isOwner).catch(() => {})

    // guardar mensaje en historial
    logMessage({
      id:       msgId,
      jid:      ctx.jid,
      sender:   ctx.sender,
      pushName: ctx.pushName,
      text:     ctx.text.slice(0, 200),
      command:  ctx.command,
      isGroup:  ctx.isGroup,
      isOwner:  ctx.isOwner,
    }).catch(() => {})

    // guardar como pendiente
    pythonPost('/api/v1/pending', {
      id:      msgId,
      jid:     ctx.jid,
      sender:  ctx.sender,
      text:    ctx.text.slice(0, 200),
      command: ctx.command,
    }).catch(() => {})
  })

  // retornar inmediatamente sin esperar Python
  return true
}