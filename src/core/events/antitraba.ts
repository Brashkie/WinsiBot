import type { WASocket } from '@whiskeysockets/baileys'
import { getGroupConfig } from './index.js'

// ─────────────────────────────────────────────────────────────────────────────
//  antitraba — elimina mensajes que pueden trabarse el chat o el dispositivo
//  Criterio 1: texto > 2000 chars (el más común, check instantáneo)
//  Criterio 2: texto con muchos saltos de línea consecutivos (flood de líneas)
//  No se llama a Rust aquí — length > 2000 es O(1), más rápido que HTTP.
// ─────────────────────────────────────────────────────────────────────────────

const MAX_CHARS    = 2_000
const MAX_NEWLINES = 400   // saltos de línea seguidos — traba móviles

function isTraba(text: string): boolean {
  if (text.length > MAX_CHARS) return true
  // Detectar bloques de saltos de línea (tipo "virus de enter")
  if (/(\n\s*){50,}/.test(text)) return true
  // Detectar texto diseñado para colapsar notificaciones (mucho espacio repetido)
  if (text.split('\n').length > MAX_NEWLINES) return true
  return false
}

export async function handleAntitraba(
  sock:       WASocket,
  jid:        string,
  sender:     string,
  msgKey:     any,
  text:       string,
  isAdmin:    boolean,
  isBotAdmin: boolean,
): Promise<void> {
  const config = getGroupConfig(jid)
  if (!config.antitraba) return
  if (isAdmin) return
  if (!isBotAdmin) return
  if (!isTraba(text)) return

  const num = sender.replace('@s.whatsapp.net', '').replace('@lid', '').replace(/[^0-9]/g, '')

  await sock.sendMessage(jid, { delete: msgKey }).catch(() => {})
  await sock.sendMessage(jid, {
    text:     `⚠️ @${num} tu mensaje fue eliminado — contenía texto que puede trabar el chat.`,
    mentions: [sender],
  }).catch(() => {})
  await sock.groupParticipantsUpdate(jid, [sender], 'remove').catch(() => {})
}
