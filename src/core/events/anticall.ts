import type { WASocket } from '@whiskeysockets/baileys'
import { logger } from '../logger.js'

// anticall es global — no por grupo
let anticallEnabled = true

export function setAnticall(enabled: boolean): void {
  anticallEnabled = enabled
}

export function isAnticallEnabled(): boolean {
  return anticallEnabled
}

export async function handleCallUpdate(
  sock:  WASocket,
  calls: any[],
): Promise<void> {
  if (!anticallEnabled) return

  for (const call of calls) {
    if (call.status !== 'offer') continue
    logger.info({ caller: call.from }, 'Llamada rechazada — anticall')
    await sock.rejectCall(call.id, call.from).catch(() => {})
    await sock.sendMessage(call.from, {
      text: 'Las llamadas estan desactivadas.',
    }).catch(() => {})
  }
}