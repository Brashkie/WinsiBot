// dragoncity.ts — Catálogo Dragon City (#pet) + economía de Oro.
//
// Datos (579 dragones) desde Brashkie/module-data en MessagePack, mismo patrón
// que rollwaifu.ts. Imágenes/videos reales desde Brashkie/module-media:
//   image: stage 0 (huevo/bebé), 1 (evolución), 3 (evolución final) — fotos
//   vid:   stage 1, 3 — animación de evolución (solo se muestra una vez, al
//          momento exacto en que el dragón alcanza esa etapa)

import axios from 'axios'
import { decode } from '@msgpack/msgpack'
import { translate } from '@vitalets/google-translate-api'
import { createCache, registerCache } from './cacheManager.js'
import type { DragonCatalog, DragonDef } from '../types/index.js'

export const SOURCE_URL =
  'https://raw.githubusercontent.com/Brashkie/module-data/main/rollmedia/dragoncity.msgpack'

const CATALOG_KEY = 'all'
const catalogCache = registerCache('dragonCatalog', createCache<DragonDef[]>({ ttl: 60 * 60_000 }))

export async function getDragons(): Promise<DragonDef[]> {
  const cached = catalogCache.get(CATALOG_KEY)
  if (cached) return cached
  const res  = await axios.get<ArrayBuffer>(SOURCE_URL, {
    timeout:      15_000,
    responseType: 'arraybuffer',
    headers:      { 'User-Agent': 'Mozilla/5.0 (compatible; WinsiBot/1.0)' },
  })
  const data     = decode(new Uint8Array(res.data)) as DragonCatalog
  const dragones = data.personajes ?? []
  catalogCache.set(CATALOG_KEY, dragones)
  return dragones
}

export async function findDragon(idOrSlug: string | number): Promise<DragonDef | undefined> {
  const dragons = await getDragons()
  const needle  = String(idOrSlug).toLowerCase().trim()
  return dragons.find(d =>
    String(d.id) === needle || d.slug.toLowerCase() === needle || d.name.toLowerCase() === needle,
  )
}

export function pickRandomDragon(dragons: DragonDef[]): DragonDef {
  return dragons[Math.floor(Math.random() * dragons.length)]!
}

// ─── Nivel / experiencia ───────────────────────────────────────────────────────
// Curva lineal, no exponencial (a diferencia del sistema de mascotas viejo):
// con evolución final en nivel 25, una curva 1.4^nivel pediría decenas de
// miles de alimentadas para llegar — esta pide ~440, alcanzable en unos
// días de juego normal dado el ritmo de acumulación de Oro.
export function expForLevel(level: number): number {
  return 50 + level * 40
}

// ─── Etapas de evolución ──────────────────────────────────────────────────────
// 0-9: huevo/bebé · 10-24: primera evolución · 25+: evolución final
export const STAGE1_LEVEL = 10
export const STAGE3_LEVEL = 25

export function stageForLevel(level: number): 0 | 1 | 3 {
  if (level >= STAGE3_LEVEL) return 3
  if (level >= STAGE1_LEVEL) return 1
  return 0
}

export function imageForStage(dragon: DragonDef, stage: 0 | 1 | 3): string | undefined {
  return dragon.image.find(i => i.stage === stage)?.url
    ?? dragon.image[0]?.url
}

export function videoForStage(dragon: DragonDef, stage: 1 | 3): string | undefined {
  return dragon.vid.find(v => v.stage === stage)?.url
}

// ─── Oro — ingreso pasivo por minuto, según nivel ─────────────────────────────
// Fórmula derivada de la tabla de ganancias de Dragon City: 30 de base, +20
// oro/nivel hasta nivel 10, después el aumento se reduce a la mitad (+10/nivel).
export function goldPerMinute(level: number): number {
  if (level <= 10) return 30 + 20 * (level - 1)
  return 210 + 10 * (level - 10)
}

// Mismo criterio que los negocios (@lib/business.ts): tope de acumulación para
// incentivar volver seguido en vez de dejarlo juntando indefinidamente.
export const MAX_ACCUMULATION_HOURS = 24

export function pendingGold(level: number, lastCollect: number): number {
  const minutesElapsed = Math.min(
    MAX_ACCUMULATION_HOURS * 60,
    (Date.now() - lastCollect) / 60_000,
  )
  return Math.floor(minutesElapsed * goldPerMinute(level))
}

// ─── Costos ───────────────────────────────────────────────────────────────────
// El huevo se paga con ¥ (BrasCoins, la moneda que todos tienen desde el
// inicio) — si costara Oro habría un bloqueo de arranque: sin dragones no se
// gana Oro, y sin Oro no se podría conseguir el primer dragón. El Oro que dan
// los dragones ya obtenidos se gasta alimentándolos para subirlos de nivel.
export const HATCH_COST_MONEY = 800
export const FEED_EXP         = 30

export function feedCostOro(level: number): number {
  return 20 + level * 8
}

// ─── Traducción de la descripción (inglés → español) ─────────────────────────
// Mismo paquete/patrón que winfo.ts. Se cachea por dragón — la descripción
// nunca cambia, así que no tiene sentido volver a pedirle la traducción a
// Google cada vez que alguien mira el mismo dragón.
const descCache = registerCache('dragonDesc', createCache<string>({ ttl: 24 * 60 * 60_000 }))

export async function translatedDesc(dragon: DragonDef): Promise<string> {
  const key = String(dragon.id)
  const cached = descCache.get(key)
  if (cached) return cached
  try {
    const { text } = await translate(dragon.desp, { to: 'es' })
    descCache.set(key, text)
    return text
  } catch {
    return dragon.desp
  }
}
