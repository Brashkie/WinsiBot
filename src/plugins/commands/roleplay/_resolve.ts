import type { WASocket, WAMessage } from '@whiskeysockets/baileys'
import { getUserData } from '@core/events.js'

export interface Resolved {
  jid:     string  // JID real (@s.whatsapp.net), nunca un LID
  display: string  // `Nombre` o `@numero` — listo para el caption
}

/**
 * Resuelve el target de un mensaje (mención o quoted), normalizando LIDs
 * a JIDs reales y buscando el nombre del usuario para mostrarlo en backticks.
 *
 * Orden de búsqueda del nombre:
 *   1. campo `notify` del participante en el grupo (nombre real de WhatsApp)
 *   2. nombre almacenado en el RPG (getUserData)
 *   3. fallback: @número en backticks
 */
export async function resolveTarget(
  sock:     WASocket,
  groupJid: string,
  msg:      WAMessage,
  sender:   string,
): Promise<Resolved> {
  const ctx       = msg.message?.extendedTextMessage?.contextInfo
  const rawTarget = ctx?.mentionedJid?.[0] ?? ctx?.participant ?? sender

  let jid  = rawTarget
  let num  = rawTarget.split('@')[0]!.replace(/[^0-9]/g, '')
  let name = ''

  if (groupJid.endsWith('@g.us')) {
    try {
      const meta = await sock.groupMetadata(groupJid)
      const p    = meta.participants.find(
        p => p.id === rawTarget || (p as any).lid === rawTarget,
      )
      if (p) {
        jid  = p.id
        num  = p.id.split('@')[0]!.replace(/[^0-9]/g, '')
        name = (p as any).notify ?? ''
      }
    } catch {}
  }

  if (!name) name = getUserData(jid).name

  return {
    jid,
    display: name ? `\`${name}\`` : `\`@${num}\``,
  }
}

/** Formatea el nombre del sender en backticks para el caption. */
export function fmt(pushName: string, jid: string): string {
  const name = pushName || jid.split('@')[0]!.replace(/[^0-9]/g, '')
  return `\`${name}\``
}
