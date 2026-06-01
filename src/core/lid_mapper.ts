// Creado por Hepein Oficial x HepeinBaileys

import type { WASocket } from '@whiskeysockets/baileys'
import { winsiStore } from './store.js'

// ─── Cache de metadatos de grupo ──────────────────────────────────────────────
const groupCache = new Map<string, { participants: any[], ts: number }>()
const GROUP_CACHE_TTL = 5 * 60 * 1000 // 5 minutos

// ─── Registrar mensaje ────────────────────────────────────────────────────────
export function registerMessage(
  msg: import('@whiskeysockets/baileys').WAMessage
): void {
  // el store ya captura esto en su bind — esta funcion es por si se necesita
  // registrar mensajes adicionales fuera del flujo normal
  const sender   = msg.key.participant ?? msg.key.remoteJid ?? ''
  const pushName = msg.pushName ?? ''
  if (!sender || !pushName) return

  // forzar actualización en el store
  const existing = winsiStore.getContact(sender) ?? { id: sender }
  ;(winsiStore as any).data?.contacts &&
    ((winsiStore as any).data.contacts[sender] = { ...existing, notify: pushName })
}

// ─── Cache de grupo con TTL ───────────────────────────────────────────────────
export async function getGroupCached(
  sock:     WASocket,
  groupJid: string,
): Promise<any[]> {
  const cached = groupCache.get(groupJid)
  if (cached && Date.now() - cached.ts < GROUP_CACHE_TTL) {
    return cached.participants
  }

  try {
    const metadata = await sock.groupMetadata(groupJid)
    groupCache.set(groupJid, {
      participants: metadata.participants,
      ts:           Date.now(),
    })

    // alimentar store con datos del grupo
    for (const p of metadata.participants) {
      const lid = (p as any).lid
      if (lid) {
        // registrar mapeo lid → jid en el store
        const contacts = (winsiStore as any).data?.contacts
        if (contacts) {
          const existing = contacts[p.id] ?? { id: p.id }
          contacts[p.id] = { ...existing, lid }
          const lidContacts = contacts[lid] ?? { id: lid }
          contacts[lid] = { ...lidContacts, id: p.id }
        }
      }
    }

    return metadata.participants
  } catch {
    return cached?.participants ?? []
  }
}

// ─── Resolver JID completo ────────────────────────────────────────────────────
export async function resolveJidFull(
  sock:     WASocket,
  id:       string,
  groupJid: string,
): Promise<{ jid: string; name: string }> {
  if (!id) return { jid: id, name: '' }

  // 1. intentar resolver desde store (RAM — instantaneo)
  const fromStore = winsiStore.resolveJid(id)
  if (
    fromStore.jid.endsWith('@s.whatsapp.net') &&
    fromStore.jid !== `${id.replace(/[^0-9]/g, '')}@s.whatsapp.net`
  ) {
    return fromStore
  }

  // 2. buscar en cache/metadatos del grupo
  if (groupJid.endsWith('@g.us')) {
    const participants = await getGroupCached(sock, groupJid)
    const participant  = participants.find((p: any) =>
      p.id === id ||
      (p as any).lid === id ||
      p.id.replace(/[^0-9]/g, '') === id.replace(/[^0-9]/g, '')
    )

    if (participant) {
      const realJid = participant.id.endsWith('@s.whatsapp.net')
        ? participant.id
        : `${participant.id.replace(/[^0-9]/g, '')}@s.whatsapp.net`

      const name = winsiStore.getName(realJid)
        || winsiStore.getName(id)
        || realJid.replace('@s.whatsapp.net', '')

      return { jid: realJid, name }
    }
  }

  // 3. fallback desde store
  return fromStore
}

// ─── Limpiar cache viejo ──────────────────────────────────────────────────────
export function clearOldCache(): void {
  const now = Date.now()
  for (const [key, val] of groupCache.entries()) {
    if (now - val.ts > GROUP_CACHE_TTL * 2) groupCache.delete(key)
  }
}

setInterval(clearOldCache, 10 * 60 * 1000)