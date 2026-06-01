import type { WASocket } from '@whiskeysockets/baileys'
import { getGroupConfig } from './index.js'

const spamMap       = new Map<string, { count: number; last: number }>()
const SPAM_LIMIT    = 5
const SPAM_INTERVAL = 5_000

export function checkSpam(sender: string, groupJid: string): boolean {
  const config = getGroupConfig(groupJid)
  if (!config.antispam) return false

  const now  = Date.now()
  const data = spamMap.get(sender) ?? { count: 0, last: now }

  if (now - data.last > SPAM_INTERVAL) {
    spamMap.set(sender, { count: 1, last: now })
    return false
  }

  data.count++
  data.last = now
  spamMap.set(sender, data)
  return data.count > SPAM_LIMIT
}

export async function handleSpam(
  sock:   WASocket,
  jid:    string,
  sender: string,
): Promise<void> {
  const num = sender.replace('@s.whatsapp.net', '').replace('@lid', '').replace(/[^0-9]/g, '')
  await sock.sendMessage(jid, {
    text:     `§ @${num} detectado como spam — calmante`,
    mentions: [sender],
  }).catch(() => {})
}