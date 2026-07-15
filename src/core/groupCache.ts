// Cache canónico de groupMetadata — reemplaza los caches independientes que
// antes vivían por separado en handler.ts y lid_mapper.ts. Un solo TTL, un
// solo registro en cacheManager, y un solo lugar para sembrar datos ya
// obtenidos por otra vía (p. ej. el store al recibir groups.update) sin
// pagar un fetch extra.

import type { WASocket, GroupMetadata } from '@whiskeysockets/baileys'
import { createCache, registerCache } from '@lib/cacheManager.js'

const GROUP_META_TTL = 5 * 60 * 1000

// periodicClear:false — su propio TTL de 5min ya lo mantiene chico; barrerlo
// entero cada 20min de más forzaría refetch de metadatos de golpe para todos
// los grupos activos (ver comentario en cacheManager.ts).
const groupMetaCache = registerCache(
  'groupMeta',
  createCache<GroupMetadata>({ ttl: GROUP_META_TTL, maxSize: 500 }),
  { periodicClear: false },
)
const lastGoodMeta    = new Map<string, GroupMetadata>() // fallback si la consulta en vivo falla

export async function getGroupMetadata(sock: WASocket, jid: string): Promise<GroupMetadata | undefined> {
  const cached = groupMetaCache.get(jid)
  if (cached) return cached
  try {
    const metadata = await sock.groupMetadata(jid)
    groupMetaCache.set(jid, metadata)
    lastGoodMeta.set(jid, metadata)
    return metadata
  } catch {
    return lastGoodMeta.get(jid)
  }
}

/** Wrapper fino — reemplaza tanto getGroupMetaCached (handler.ts) como getGroupCached (lid_mapper.ts). */
export async function getGroupParticipants(sock: WASocket, jid: string): Promise<GroupMetadata['participants']> {
  const metadata = await getGroupMetadata(sock, jid)
  return metadata?.participants ?? []
}

/** Sembrar el cache desde metadata ya obtenida por otra vía (p. ej. eventos de Baileys). */
export function setGroupMetadata(jid: string, metadata: GroupMetadata): void {
  groupMetaCache.set(jid, metadata)
  lastGoodMeta.set(jid, metadata)
}

export function invalidateGroupMetadata(jid: string): void {
  groupMetaCache.delete(jid)
  lastGoodMeta.delete(jid)
}
