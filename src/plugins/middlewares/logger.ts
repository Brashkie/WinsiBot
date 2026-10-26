import type { BotContext } from '../../types/index.js'
import { color, themes, ascii } from 'ansimax'
import { anchoTerminal, cortar } from '@lib/terminal.js'
// La hora de Lima con Intl, que Node ya trae. Era moment-timezone, con su base
// de zonas horarias entera en memoria, para formatear HH:mm:ss en cada mensaje.
// El formateador se arma una vez: crearlo es lo caro, usarlo no.
const HORA_LIMA = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'America/Lima', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
})
import { countMessage } from '@core/botStats.js'
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
  const time  = HORA_LIMA.format(Date.now())
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
  // Lo que varía (el texto, el nombre) se corta para que la caja o el renglón
  // entren en la terminal: en Termux vertical se partían. Ver lib/terminal.ts.
  const ancho = anchoTerminal()
  if (isCmd) {
    const body = [
      `${color.dim('❖')} ${color.bold('Hora')}      ${themes.success(time)}`,
      `${color.dim('❖')} ${color.bold('Usuario')}   ${color.cyan(cortar(ctx.pushName, Math.max(4, ancho - 26 - formatJid(ctx.sender).length)))} ${color.dim('(' + formatJid(ctx.sender) + ')')}`,
      `${color.dim('❖')} ${color.bold('Chat')}      ${ctx.isGroup ? color.magenta('Grupo') : themes.warning('Privado')} ${color.dim(formatJid(ctx.jid))}`,
      `${color.dim('❖')} ${color.bold('Texto')}     ${cortar(ctx.text, Math.max(8, Math.min(60, ancho - 22)))}`,
      `${color.dim('❖')} ${color.bold('Tipo')}      ${getTypeColor(type)} ${color.bold(color.magenta(`CMD: ${ctx.command}`))}`,
      `${color.dim('❖')} ${color.bold('Owner')}     ${ctx.isOwner ? themes.success('✔ Si') : themes.error('✗ No')}`,
    ].join('\n')

    const header = ascii.box(body, {
      title:       config.botName,
      titleAlign:  'center',
      borderStyle: 'rounded',
      // Sin el margen interno en una terminal angosta: son 2 columnas más.
      padding:     ancho < 60 ? 0 : 1,
    })

    console.log(header)
  } else {
    console.log(
      `${color.dim('❖')} ${themes.success(time)} ${color.dim(formatJid(ctx.jid))} ${color.cyan(cortar(ctx.pushName, Math.max(4, ancho - 24 - formatJid(ctx.jid).length)))} ${color.dim('·')} ${getTypeColor(type)}`,
    )
  }

  // Antes acá salían dos llamadas HTTP a Python por CADA mensaje
  // (getOrCreateUser y logMessage) para escribir una fila en un .parquet que
  // solo se usaba para contar filas. Ahora es un ++ en memoria; el acumulado
  // se vuelca a Rust una vez por minuto. Ver core/botStats.ts.
  countMessage(ctx.command || undefined)

  return true
}
