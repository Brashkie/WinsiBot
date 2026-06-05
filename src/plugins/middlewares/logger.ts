import type { BotContext } from '../../types/index.js'
import { color, themes, ascii } from 'ansimax'
import moment from 'moment-timezone'
import { getOrCreateUser, logMessage } from '@lib/pythonBridge.js'
import { pythonPost } from '@lib/pythonBridge.js'
import { randomUUID } from 'crypto'
import { config } from '@config'

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
  const map: Record<string, (t: string) => string> = {
    IMAGE:   (t) => color.magenta(t),
    VIDEO:   (t) => color.red(t),
    AUDIO:   (t) => themes.warning(t),
    STICKER: (t) => color.cyan(t),
    DOC:     (t) => color.dim(t),
    TEXT:    (t) => color.blue(t),
    MEDIA:   (t) => color.dim(t),
  }
  return (map[type] ?? ((t) => color.blue(t)))(`${type}`)
}

export async function loggerMiddleware(ctx: BotContext): Promise<boolean> {
  const time  = moment().tz('America/Lima').format('HH:mm:ss')
  const isCmd = config.prefix.some(p => ctx.text.startsWith(p))
  const type  = getMsgTypeLabel(ctx)
  const line  = ascii.divider({ width: 50 })

  const header = `
${line}
 ${color.bold(color.cyan('(つ▀¯▀)つ'))} ${color.bold('WINSIBOT v8')} ${color.bold(color.cyan('(つ▀¯▀)つ'))}
 ${color.dim('❖')} ${color.bold('Hora:')}     ${themes.success(` ${time} `)}
 ${color.dim('❖')} ${color.bold('Usuario:')} ${color.cyan(ctx.pushName)} ${color.dim('(' + formatJid(ctx.sender) + ')')}
 ${color.dim('❖')} ${color.bold('Chat:')}     ${ctx.isGroup ? color.magenta('Grupo') : themes.warning('Privado')} ${color.dim(formatJid(ctx.jid))}
 ${color.dim('❖')} ${color.bold('Texto:')}    ${ctx.text.slice(0, 60)}${ctx.text.length > 60 ? color.dim('...') : ''}
 ${color.dim('❖')} ${color.bold('Tipo:')}     ${getTypeColor(type)} ${isCmd ? color.bold(color.magenta(` CMD: ${ctx.command} `)) : ''}
 ${color.dim('❖')} ${color.bold('Owner:')}    ${ctx.isOwner ? themes.success('✔ Si') : themes.error('✗ No')}
${line}`

  console.log(header)

  // ─── todo lo demas es fire and forget — no bloquear el handler ────────────
  setImmediate(() => {
    const msgId = randomUUID()

    getOrCreateUser(ctx.sender, ctx.pushName, ctx.isOwner).catch(() => {})

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

    pythonPost('/api/v1/pending', {
      id:      msgId,
      jid:     ctx.jid,
      sender:  ctx.sender,
      text:    ctx.text.slice(0, 200),
      command: ctx.command,
    }).catch(() => {})
  })

  return true
}
