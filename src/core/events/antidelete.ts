import type { WASocket } from '@whiskeysockets/baileys'
import { getGroupConfig } from './index.js'

export async function handleDeleteUpdate(
  sock:    WASocket,
  message: { fromMe: boolean; id: string; participant?: string | undefined; remoteJid: string },
): Promise<void> {
  if (message.fromMe) return

  const chatId = message.remoteJid
  const config = getGroupConfig(chatId)
  if (!config.antidelete) return

  const participant = message.participant ?? message.remoteJid
  const num         = participant.replace('@s.whatsapp.net', '').replace('@lid', '').replace(/[^0-9]/g, '')

  await sock.sendMessage(chatId, {
    text:     `◈ Mensaje eliminado por @${num}`,
    mentions: [participant],
  }).catch(() => {})
}