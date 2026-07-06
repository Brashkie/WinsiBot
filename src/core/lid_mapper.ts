// Creado por Hepein Oficial x HepeinBaileys

import type { WASocket } from '@whiskeysockets/baileys'
import { winsiStore } from './store.js'
import { getGroupParticipants } from './groupCache.js'

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

// ─── Grupo vía cache canónico (groupCache.ts) ─────────────────────────────────
export async function getGroupCached(
  sock:     WASocket,
  groupJid: string,
): Promise<any[]> {
  const participants = await getGroupParticipants(sock, groupJid)

  // alimentar store con datos del grupo (mapeo lid → jid)
  for (const p of participants) {
    const lid = (p as any).lid
    if (lid) {
      const contacts = (winsiStore as any).data?.contacts
      if (contacts) {
        const existing = contacts[p.id] ?? { id: p.id }
        contacts[p.id] = { ...existing, lid }
        const lidContacts = contacts[lid] ?? { id: lid }
        contacts[lid] = { ...lidContacts, id: p.id }
      }
    }
  }

  return participants
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