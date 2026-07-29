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

  // La caja ANSI multi-línea completa solo para comandos reales — armarla Y
  // pintarla (console.log es SÍNCRONO en una consola real de Windows) en
  // CADA mensaje, incluida toda la charla común que no le habla al bot, es
  // trabajo síncrono real en el único hilo del event loop de Node por cada
  // uno de esos mensajes. En un bot con 400+ grupos activos la charla común
  // es la inmensa mayoría del volumen — esto retrasaba el procesamiento de
  // TODO lo demás en curso ese mismo tick, no solo el log. Python igual
  // persiste cada mensaje (logMessage/pending, fire-and-forget más abajo)
  // así que no se pierde nada de trazabilidad real, solo se achica lo que
  // se pinta en vivo en consola para lo que no es un comando.
  if (isCmd) {
    const body = [
      `${color.dim('❖')} ${color.bold('Hora')}      ${themes.success(time)}`,
      `${color.dim('❖')} ${color.bold('Usuario')}   ${color.cyan(ctx.pushName)} ${color.dim('(' + formatJid(ctx.sender) + ')')}`,
      `${color.dim('❖')} ${color.bold('Chat')}      ${ctx.isGroup ? color.magenta('Grupo') : themes.warning('Privado')} ${color.dim(formatJid(ctx.jid))}`,
      `${color.dim('❖')} ${color.bold('Texto')}     ${ctx.text.slice(0, 60)}${ctx.text.length > 60 ? color.dim('...') : ''}`,
      `${color.dim('❖')} ${color.bold('Tipo')}      ${getTypeColor(type)} ${color.bold(color.magenta(`CMD: ${ctx.command}`))}`,
      `${color.dim('❖')} ${color.bold('Owner')}     ${ctx.isOwner ? themes.success('✔ Si') : themes.error('✗ No')}`,
    ].join('\n')

    const header = ascii.box(body, {
      title:       config.botName,
      titleAlign:  'center',
      borderStyle: 'rounded',
      padding:     1,
    })

    console.log(header)
  } else {
    console.log(
      `${color.dim('❖')} ${themes.success(time)} ${color.dim(formatJid(ctx.jid))} ${color.cyan(ctx.pushName)} ${color.dim('·')} ${getTypeColor(type)}`,
    )
  }

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
