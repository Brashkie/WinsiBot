// Hecho por HepeinBaileys

import type { WASocket } from '@whiskeysockets/baileys'
import { resolveJidFull } from '@core/lid_mapper.js'
import { winsiStore } from '@core/store.js'

// ─── Extraer número limpio ────────────────────────────────────────────────────
export function getNumber(jid: string): string {
  if (!jid) return ''
  return (jid.split('@')[0] ?? '').replace(/[^0-9]/g, '')
}

// ─── Forzar formato @s.whatsapp.net ──────────────────────────────────────────
export function forceJid(jid: string): string {
  if (!jid || jid.endsWith('@g.us')) return jid
  const num = getNumber(jid)
  return `${num}@s.whatsapp.net`
}

// ─── Resolver JID — delega a lid_mapper ──────────────────────────────────────
export async function resolveJid(
  sock:     WASocket,
  id:       string,
  groupJid: string,
  _store?:  any,
): Promise<{ jid: string; name: string }> {
  return resolveJidFull(sock, id, groupJid)
}

// ─── Obtener nombre desde store ───────────────────────────────────────────────
export function getName(jid: string): string {
  return winsiStore.getName(jid)
}

// ─── Enviar mención correcta ──────────────────────────────────────────────────
export async function sendMention(
  sock:         WASocket,
  groupJid:     string,
  text:         string,
  jidToMention: string,
): Promise<void> {
  const resolved = await resolveJidFull(sock, jidToMention, groupJid)
  await sock.sendMessage(groupJid, {
    text:     text.replace('@user', `@${resolved.name}`),
    mentions: [resolved.jid],
  })
}