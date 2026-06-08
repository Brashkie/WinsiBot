import type { WASocket } from '@whiskeysockets/baileys'
import { config }        from '../config.js'

// ─────────────────────────────────────────────────────────────────────────────
//  WinsiBot — NOTIFICATIONS
//  Envío de notificaciones a owners, admins de grupo y usuarios.
// ─────────────────────────────────────────────────────────────────────────────

type SendOpts = { quoted?: object }

/** Envía un mensaje de texto a todos los owners configurados. */
export async function notifyOwners(
  sock: WASocket,
  text: string,
  opts: SendOpts = {},
): Promise<void> {
  await Promise.allSettled(
    config.ownerJid.map(jid => sock.sendMessage(jid, { text }, opts as any)),
  )
}

/** Envía un mensaje de texto a todos los admins de un grupo. */
export async function notifyAdmins(
  sock:     WASocket,
  groupJid: string,
  text:     string,
  opts:     SendOpts = {},
): Promise<void> {
  const meta = await sock.groupMetadata(groupJid).catch(() => null)
  if (!meta) return
  const admins = meta.participants.filter(
    p => p.admin === 'admin' || p.admin === 'superadmin',
  )
  await Promise.allSettled(
    admins.map(p => sock.sendMessage(p.id, { text }, opts as any)),
  )
}

/** Envía un mensaje de texto a un JID específico. */
export async function notifyUser(
  sock: WASocket,
  jid:  string,
  text: string,
): Promise<void> {
  await sock.sendMessage(jid, { text })
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
}
