// ─── Full Clan System ─────────────────────────────────────────────────────────
// Extiende el ClanData básico de events/index.ts

export type ClanRank = 'miembro' | 'élite' | 'coleader' | 'líder'

export interface ClanWar {
  id:         string
  enemy:      string     // clan tag
  startTime:  number
  endTime:    number     // +24h
  kills:      number     // our kills
  enemyKills: number
  result:     'win' | 'loss' | 'draw' | 'active' | 'pending'
  cooldown:   number     // after war ends, next war must wait 48h
}

export interface Territory {
  id:     string
  name:   string
  emoji:  string
  income: number   // monedas/hora que genera
  owner?: string   // clan tag
}

export interface ClanExtended {
  // Rango de cada miembro
  ranks:        Record<string, ClanRank>    // jid → rank
  // Tesoro
  treasury:     number
  taxRate:      number      // 0-30%
  lastTax:      number      // timestamp del último cobro de impuestos
  // Guerras
  wars:         ClanWar[]
  lastWarEnd:   number      // timestamp de fin de última guerra
  // Territorios
  territories:  string[]    // territory IDs
  // Alianzas
  alliances:    string[]    // clan tags
  // Log de actividad
  log:          string[]    // últimas 20 entradas
  // Solicitudes de unirse
  requests:     string[]    // JIDs que han solicitado unirse
}

// ─── Territories catalog ──────────────────────────────────────────────────────

export const TERRITORIES: readonly Territory[] = [
  { id: 'forest_north',   name: 'Bosque Norte',      emoji: '🌲', income: 50  },
  { id: 'mountain_east',  name: 'Montaña Este',       emoji: '⛰️', income: 80  },
  { id: 'coastal_west',   name: 'Costa Oeste',        emoji: '🏖️', income: 60  },
  { id: 'desert_south',   name: 'Desierto Sur',       emoji: '🏜️', income: 70  },
  { id: 'volcano',        name: 'Volcán',             emoji: '🌋', income: 120 },
  { id: 'crystal_cave',   name: 'Cueva de Cristal',   emoji: '💎', income: 150 },
  { id: 'ancient_ruins',  name: 'Ruinas Antiguas',    emoji: '🏛️', income: 100 },
  { id: 'dark_swamp',     name: 'Pantano Oscuro',     emoji: '🌿', income: 45  },
  { id: 'sky_fortress',   name: 'Fortaleza del Cielo',emoji: '🏰', income: 200 },
  { id: 'sea_of_storms',  name: 'Mar de Tormentas',   emoji: '⛈️', income: 130 },
  { id: 'golden_plains',  name: 'Llanuras Doradas',   emoji: '🌾', income: 75  },
  { id: 'ice_tundra',     name: 'Tundra de Hielo',    emoji: '❄️', income: 90  },
  { id: 'shadow_realm',   name: 'Reino de Sombras',   emoji: '🌑', income: 180 },
  { id: 'thunder_peaks',  name: 'Picos del Trueno',   emoji: '⚡', income: 110 },
  { id: 'enchanted_lake', name: 'Lago Encantado',     emoji: '🌊', income: 95  },
  { id: 'dragon_keep',    name: 'Guarida del Dragón', emoji: '🐉', income: 250 },
  { id: 'goblin_mines',   name: 'Minas de Goblins',   emoji: '⛏️', income: 85  },
  { id: 'sacred_grove',   name: 'Arboleda Sagrada',   emoji: '🌳', income: 140 },
  { id: 'astral_nexus',   name: 'Nexo Astral',        emoji: '✨', income: 220 },
  { id: 'iron_fortress',  name: 'Fortaleza de Hierro',emoji: '🗡️', income: 160 },
]

const TERRITORY_MAP = new Map(TERRITORIES.map(t => [t.id, t]))

// ─── In-memory extended data ──────────────────────────────────────────────────
// Maps clan tag → extended data (separate from core ClanData in index.ts)

const clanExtended = new Map<string, ClanExtended>()

function uid() { return Math.random().toString(36).slice(2, 10) }

const WAR_DURATION = 24 * 3_600_000   // 24h
const WAR_COOLDOWN = 48 * 3_600_000   // 48h cooldown between wars
const MAX_ALLIANCES = 5
const TAX_INTERVAL  = 60 * 60_000     // 1h

// ─── Clan Manager ─────────────────────────────────────────────────────────────

export class ClanManager {
  static getExtended(tag: string): ClanExtended {
    const key = tag.toUpperCase()
    if (!clanExtended.has(key)) {
      clanExtended.set(key, ClanManager.defaultExtended())
    }
    return clanExtended.get(key)!
  }

  static defaultExtended(): ClanExtended {
    return {
      ranks:       {},
      treasury:    0,
      taxRate:     5,
      lastTax:     Date.now(),
      wars:        [],
      lastWarEnd:  0,
      territories: [],
      alliances:   [],
      log:         [],
      requests:    [],
    }
  }

  // ─── Rank management ───────────────────────────────────────────────────────

  static getRank(ext: ClanExtended, jid: string, leaderJid: string): ClanRank {
    if (jid === leaderJid) return 'líder'
    return ext.ranks[jid] ?? 'miembro'
  }

  static setRank(ext: ClanExtended, jid: string, rank: ClanRank): void {
    ext.ranks[jid] = rank
  }

  static rankPower(rank: ClanRank): number {
    return { 'miembro': 1, 'élite': 2, 'coleader': 3, 'líder': 4 }[rank]
  }

  static rankEmoji(rank: ClanRank): string {
    return { 'miembro': '👤', 'élite': '⭐', 'coleader': '🌟', 'líder': '👑' }[rank]
  }

  // ─── Treasury ──────────────────────────────────────────────────────────────

  static collectTax(ext: ClanExtended, memberCount: number): number {
    const now     = Date.now()
    if (now - ext.lastTax < TAX_INTERVAL) return 0
    const base    = memberCount * 50
    const tax     = Math.floor(base * ext.taxRate / 100)
    ext.treasury += tax
    ext.lastTax   = now
    return tax
  }

  static addToTreasury(ext: ClanExtended, amount: number): void {
    ext.treasury += amount
  }

  static deductFromTreasury(ext: ClanExtended, amount: number): boolean {
    if (ext.treasury < amount) return false
    ext.treasury -= amount
    return true
  }

  // ─── Wars ──────────────────────────────────────────────────────────────────

  static canStartWar(ext: ClanExtended): { ok: boolean; reason?: string } {
    const activeWar = ext.wars.find(w => w.result === 'active')
    if (activeWar) return { ok: false, reason: 'Ya estás en una guerra activa' }
    if (Date.now() - ext.lastWarEnd < WAR_COOLDOWN) {
      const left = Math.ceil((ext.lastWarEnd + WAR_COOLDOWN - Date.now()) / 3_600_000)
      return { ok: false, reason: `Cooldown de guerra: ${left}h restantes` }
    }
    return { ok: true }
  }

  static startWar(ext: ClanExtended, enemyTag: string): ClanWar {
    const war: ClanWar = {
      id:         uid(),
      enemy:      enemyTag.toUpperCase(),
      startTime:  Date.now(),
      endTime:    Date.now() + WAR_DURATION,
      kills:      0,
      enemyKills: 0,
      result:     'active',
      cooldown:   0,
    }
    ext.wars.push(war)
    setTimeout(() => ClanManager.resolveWar(ext, war), WAR_DURATION)
    return war
  }

  static resolveWar(ext: ClanExtended, war: ClanWar): void {
    if (war.result !== 'active') return
    if (war.kills > war.enemyKills)       war.result = 'win'
    else if (war.kills < war.enemyKills)  war.result = 'loss'
    else                                  war.result = 'draw'
    ext.lastWarEnd = Date.now()
  }

  static addKill(ext: ClanExtended): boolean {
    const war = ext.wars.find(w => w.result === 'active')
    if (!war) return false
    war.kills++
    return true
  }

  // ─── Territories ───────────────────────────────────────────────────────────

  static getTerritory(id: string): Territory | undefined { return TERRITORY_MAP.get(id) }

  static conquer(ext: ClanExtended, territoryId: string): boolean {
    if (!TERRITORY_MAP.has(territoryId)) return false
    if (ext.territories.includes(territoryId)) return false
    ext.territories.push(territoryId)
    return true
  }

  static lose(ext: ClanExtended, territoryId: string): boolean {
    const i = ext.territories.indexOf(territoryId)
    if (i === -1) return false
    ext.territories.splice(i, 1)
    return true
  }

  static calcTerritoryIncome(ext: ClanExtended): number {
    return ext.territories.reduce((sum, id) => {
      return sum + (TERRITORY_MAP.get(id)?.income ?? 0)
    }, 0)
  }

  // ─── Alliances ─────────────────────────────────────────────────────────────

  static ally(extA: ClanExtended, tagB: string): { ok: boolean; reason?: string } {
    if (extA.alliances.length >= MAX_ALLIANCES) return { ok: false, reason: `Máximo ${MAX_ALLIANCES} alianzas` }
    if (extA.alliances.includes(tagB.toUpperCase())) return { ok: false, reason: 'Ya son aliados' }
    extA.alliances.push(tagB.toUpperCase())
    return { ok: true }
  }

  static breakAlliance(extA: ClanExtended, tagB: string): boolean {
    const i = extA.alliances.indexOf(tagB.toUpperCase())
    if (i === -1) return false
    extA.alliances.splice(i, 1)
    return true
  }

  // ─── Activity log ──────────────────────────────────────────────────────────

  static log(ext: ClanExtended, entry: string): void {
    const ts = new Date().toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })
    ext.log.unshift(`[${ts}] ${entry}`)
    if (ext.log.length > 20) ext.log.pop()
  }

  // ─── Requests ──────────────────────────────────────────────────────────────

  static addRequest(ext: ClanExtended, jid: string): boolean {
    if (ext.requests.includes(jid)) return false
    ext.requests.push(jid)
    return true
  }

  static approveRequest(ext: ClanExtended, jid: string): boolean {
    const i = ext.requests.indexOf(jid)
    if (i === -1) return false
    ext.requests.splice(i, 1)
    return true
  }

  // ─── Format ────────────────────────────────────────────────────────────────

  static formatInfo(
    tag:    string,
    name:   string,
    icon:   string,
    level:  number,
    ext:    ClanExtended,
    memberCount: number,
  ): string {
    const income   = ClanManager.calcTerritoryIncome(ext)
    const activeWar= ext.wars.find(w => w.result === 'active')
    const lines = [
      `*${icon} CLAN: ${name} [${tag}]*`,
      `_Nivel ${level} — ${memberCount} miembros_`,
      '',
      `💰 Tesoro: ${ext.treasury.toLocaleString()} monedas`,
      `📊 Tasa de impuesto: ${ext.taxRate}%`,
      `🗺️ Territorios: ${ext.territories.length} (${income}/h)`,
      `🤝 Alianzas: ${ext.alliances.join(', ') || 'Ninguna'}`,
    ]
    if (activeWar) {
      const left = Math.ceil((activeWar.endTime - Date.now()) / 3_600_000)
      lines.push(`⚔️ En guerra con [${activeWar.enemy}] — ${left}h restantes`)
    }
    return lines.join('\n')
  }
}
