import type { WASocket } from '@whiskeysockets/baileys'
import { config }        from '../config.js'
import { logMessage }    from './pythonBridge.js'
import { getGroupMetadata } from '@core/groupCache.js'

// ─────────────────────────────────────────────────────────────────────────────
//  WinsiBot — NOTIFICATIONS
//  Envío de notificaciones a owners, admins y usuarios.
//  Retry automático por destinatario · log Python opcional.
// ─────────────────────────────────────────────────────────────────────────────

type SendOpts = { quoted?: object; logToPython?: boolean }

async function _sendWithRetry(
  sock: WASocket,
  jid:  string,
  text: string,
  opts: SendOpts = {},
  retries = 2,
): Promise<void> {
  for (let i = 0; i <= retries; i++) {
    try {
      await sock.sendMessage(jid, { text }, opts as any)
      if (opts.logToPython) {
        void logMessage({
          id:       `notif-${Date.now()}`,
          jid,
          sender:   sock.user?.id ?? 'bot',
          pushName: 'WinsiBot',
          text,
          command:  'notification',
          isGroup:  jid.endsWith('@g.us'),
          isOwner:  false,
        })
      }
      return
    } catch (err: any) {
      if (i === retries) throw err
      await new Promise<void>(r => setTimeout(r, 500 * (i + 1)))
    }
  }
}

/** Envía un mensaje de texto a todos los owners configurados. */
export async function notifyOwners(
  sock: WASocket,
  text: string,
  opts: SendOpts = {},
): Promise<void> {
  await Promise.allSettled(
    config.ownerJid.map(jid => _sendWithRetry(sock, jid, text, opts)),
  )
}

/** Envía un mensaje de texto a todos los admins de un grupo. */
export async function notifyAdmins(
  sock:     WASocket,
  groupJid: string,
  text:     string,
  opts:     SendOpts = {},
): Promise<void> {
  const meta = await getGroupMetadata(sock, groupJid)
  if (!meta) return
  const admins = meta.participants.filter(
    p => p.admin === 'admin' || p.admin === 'superadmin',
  )
  await Promise.allSettled(
    admins.map(p => _sendWithRetry(sock, p.id, text, opts)),
  )
}

/** Envía un mensaje de texto a un JID específico. */
export async function notifyUser(
  sock: WASocket,
  jid:  string,
  text: string,
  opts: SendOpts = {},
): Promise<void> {
  await _sendWithRetry(sock, jid, text, opts)
}

/**
 * Envía una notificación a un canal de newsletter (JID con @newsletter).
 * No hace retry — los canales tienen sus propias restricciones de Baileys.
 */
export async function notifyChannel(
  sock:       WASocket,
  channelJid: string,
  text:       string,
): Promise<void> {
  await sock.sendMessage(channelJid, { text })
}

// ─── Templates ────────────────────────────────────────────────────────────────

export const templates = {
  banAlert: (jid: string, reason: string) =>
    `🚫 *Alerta de ban*\nUsuario: @${jid.split('@')[0]}\nMotivo: ${reason}`,

  warnAlert: (jid: string, warns: number, max: number) =>
    `⚠️ *Advertencia ${warns}/${max}*\nUsuario: @${jid.split('@')[0]}`,

  kickAlert: (jid: string) =>
    `👢 *Expulsión*\nUsuario: @${jid.split('@')[0]} ha sido expulsado`,

  botError: (cmd: string, err: string) =>
    `🔴 *Error en comando*\n> ${cmd}\n${err}`,

  botStart: (version: string) =>
    `✅ *WinsiBot ${version} en línea*\n${new Date().toLocaleString('es-PE')}`,

  botStop: () =>
    `🛑 *WinsiBot detenido*\n${new Date().toLocaleString('es-PE')}`,

  spamAlert: (jid: string, count: number) =>
    `🔴 *Anti-spam*\nUsuario: @${jid.split('@')[0]} envió ${count} mensajes en poco tiempo`,

  upgradeAlert: (jid: string, role: string) =>
    `⭐ *Nuevo ${role}*\n@${jid.split('@')[0]} ha sido promovido a ${role}`,

  securityAlert: (jid: string, intent: string, confidence: number) =>
    `🛡️ *Alerta de seguridad*\nUsuario: @${jid.split('@')[0]}\nTipo: ${intent} (${Math.round(confidence * 100)}%)`,
}
