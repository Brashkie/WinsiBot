import type { WASocket } from '@whiskeysockets/baileys'
import { getGroupConfig } from './index.js'
import { logger } from '../logger.js'

// ─────────────────────────────────────────────────────────────────────────────
//  autoAccept / autoReject — grupos con aprobación manual de solicitudes
//  ('created' = alguien pidió unirse; 'revoked'/'rejected' no requieren acción)
// ─────────────────────────────────────────────────────────────────────────────

export async function handleJoinRequest(
  sock:   WASocket,
  update: { id: string; author: string; participant: string; action: string; method?: string | undefined },
): Promise<void> {
  if (update.action !== 'created') return

  const config = getGroupConfig(update.id)
  if (!config.autoAccept && !config.autoReject) return

  const decision = config.autoAccept ? 'approve' : 'reject'

  await sock.groupRequestParticipantsUpdate(update.id, [update.participant], decision).catch(err => {
    logger.warn({ err }, `[joinRequest] groupRequestParticipantsUpdate (${decision}) falló`)
  })
}
