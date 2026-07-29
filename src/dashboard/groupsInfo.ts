// groupsInfo.ts — lista de grupos + admin status para el panel web.
//
// sock.groupFetchAllParticipating() es la misma llamada pesada que
// socket.ts ya gatea a 30 min para su propia precarga — acá se usa un
// cooldown propio (más corto, el panel puede tolerar datos con hasta 5 min
// de atraso) en vez de tocar esa lógica ya afinada, para no arriesgar
// romper el throttling que ya se peleó tanto para Bad MAC/rate limits.

import type { AdminGroupSummary } from './types.js'
import { getMainSock } from './mainSock.js'

interface CachedGroup {
  jid:          string
  name:         string
  participants: Array<{ id: string; admin: string | null }>
}

let _cache: CachedGroup[] = []
let _cachedAt = 0
const CACHE_TTL_MS = 5 * 60_000

async function refreshGroups(): Promise<CachedGroup[]> {
  const sock = getMainSock()
  if (!sock) return []
  if (Date.now() - _cachedAt < CACHE_TTL_MS) return _cache

  try {
    const groups = await Promise.race([
      sock.groupFetchAllParticipating(),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), 15_000)),
    ])
    _cache = Object.values(groups).map((g: any) => ({
      jid:          g.id,
      name:         g.subject ?? g.id,
      participants: (g.participants ?? []).map((p: any) => ({ id: p.id, admin: p.admin ?? null })),
    }))
    _cachedAt = Date.now()
  } catch {
    // si falla, se sigue sirviendo el cache viejo (mejor stale que nada)
  }

  return _cache
}

/** `jid === null` → todos los grupos (uso del owner). Si no, solo donde `jid` es admin. */
export async function getAdminGroups(jid: string | null): Promise<AdminGroupSummary[]> {
  const groups = await refreshGroups()

  const filtered = jid === null
    ? groups
    : groups.filter(g => g.participants.some(p => p.id === jid && p.admin))

  return filtered.map(g => ({ jid: g.jid, name: g.name }))
}

export async function isGroupAdmin(groupJid: string, jid: string): Promise<boolean> {
  const groups = await refreshGroups()
  const group  = groups.find(g => g.jid === groupJid)
  return !!group?.participants.some(p => p.id === jid && p.admin)
}
