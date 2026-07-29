// Hecho por HepeinBaileys

import type { WASocket } from '@whiskeysockets/baileys'
import { resolveJidFull } from '@core/lid_mapper.js'
import { winsiStore } from '@core/store.js'

// ─── Extraer número limpio ────────────────────────────────────────────────────
export function getNumber(jid: string): string {
  if (!jid) return ''
  return (jid.split('@')[0] ?? '').replace(/[^0-9]/g, '')
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
