import type { WASocket } from '@whiskeysockets/baileys'
import { getGroupConfig } from './index.js'

// palabras clave — expandir según necesidad
const NSFW_WORDS = [
  'xxx', 'porn', 'porno', 'nsfw', 'nude', 'nudes',
  'onlyfans', 'sexo', 'sex', 'desnudo',
]

export function containsNSFW(text: string): boolean {
  const lower = text.toLowerCase()
  return NSFW_WORDS.some(w => lower.includes(w))
}

export async function handleNSFW(
  sock:    WASocket,
  jid:     string,
  sender:  string,
  msgKey:  any,
  isAdmin: boolean,
): Promise<void> {
  const config = getGroupConfig(jid)
  if (!config.nsfw) return  // si nsfw está ON — permitir
  if (isAdmin) return

  await sock.sendMessage(jid, { delete: msgKey }).catch(() => {})

  const num = sender.replace('@s.whatsapp.net', '').replace('@lid', '').replace(/[^0-9]/g, '')
  await sock.sendMessage(jid, {
    text:     `§ @${num} contenido NSFW no permitido`,
    mentions: [sender],
  }).catch(() => {})
}