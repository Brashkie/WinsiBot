import type { WASocket } from '@whiskeysockets/baileys'
import { getGroupConfig } from './index.js'

const LINK_REGEX = /(https?:\/\/|www\.|chat\.whatsapp\.com|t\.me\/|discord\.gg\/)[^\s]*/i

export function containsLink(text: string): boolean {
  return LINK_REGEX.test(text)
}

export async function handleAntilink(
  sock:     WASocket,
  jid:      string,
  sender:   string,
  msgKey:   any,
  isAdmin:  boolean,
): Promise<void> {
  const config = getGroupConfig(jid)
  if (!config.antilink) return
  if (isAdmin) return

  // eliminar mensaje
  await sock.sendMessage(jid, { delete: msgKey }).catch(() => {})

  const num = sender.replace('@s.whatsapp.net', '').replace('@lid', '').replace(/[^0-9]/g, '')
  await sock.sendMessage(jid, {
    text:     `§ @${num} los links no estan permitidos`,
    mentions: [sender],
  }).catch(() => {})
}