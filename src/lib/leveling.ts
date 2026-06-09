// ─── Advanced Leveling System ─────────────────────────────────────────────────
// Complementa el sistema básico de exp/level en events/index.ts

export interface PrestigeData {
  level:     number      // 0-10 prestige levels
  totalXp:   number      // XP acumulado de toda la vida
  bonusRate: number      // multiplicador adicional (prestige * 0.1)
}

export interface StreakData {
  days:     number
  lastDate: string       // 'YYYY-MM-DD'
  best:     number
}

export interface LevelingMeta {
  prestige: PrestigeData
  streak:   StreakData
  medals:   string[]
  xpBoost:  number       // multiplicador temporal (premium, evento, etc.)
  boostExpires: number   // timestamp
}

// ─── Medal definitions ────────────────────────────────────────────────────────

export interface Medal {
  id:       string
  name:     string
  emoji:    string
  desc:     string
  cond:     (meta: LevelingMeta, level: number) => boolean
}

export const MEDALS: readonly Medal[] = [
  { id: 'first_steps',  name: 'Primeros Pasos',  emoji: '👶', desc: 'Alcanza nivel 5',              cond: (_, l) => l >= 5    },
  { id: 'warrior',      name: 'Guerrero',         emoji: '⚔️', desc: 'Alcanza nivel 20',             cond: (_, l) => l >= 20   },
  { id: 'hero',         name: 'Héroe',            emoji: '🦸', desc: 'Alcanza nivel 50',             cond: (_, l) => l >= 50   },
  { id: 'legend',       name: 'Leyenda',          emoji: '🌟', desc: 'Alcanza nivel 100',            cond: (_, l) => l >= 100  },
  { id: 'prestige1',    name: 'Renacido',         emoji: '🔄', desc: 'Primer prestigio',             cond: (m)    => m.prestige.level >= 1 },
  { id: 'prestige5',    name: 'Ascendido',        emoji: '✨', desc: '5 prestigios',                 cond: (m)    => m.prestige.level >= 5 },
  { id: 'prestige10',   name: 'Trascendido',      emoji: '💫', desc: 'Prestigio máximo (10)',        cond: (m)    => m.prestige.level >= 10 },
  { id: 'streak7',      name: 'Una Semana',       emoji: '🗓️', desc: '7 días seguidos activo',      cond: (m)    => m.streak.days >= 7  },
  { id: 'streak30',     name: 'Mes Constante',    emoji: '📅', desc: '30 días seguidos activo',     cond: (m)    => m.streak.days >= 30 },
  { id: 'veteran',      name: 'Veterano',         emoji: '🎖️', desc: 'XP total > 1,000,000',        cond: (m)    => m.prestige.totalXp >= 1_000_000 },
]

// ─── Prestige thresholds ──────────────────────────────────────────────────────

export const PRESTIGE_LEVEL_REQUIRED = 100   // nivel necesario para prestigiar

// ─── Manager ─────────────────────────────────────────────────────────────────

export class LevelingManager {
  static defaultMeta(): LevelingMeta {
    return {
      prestige:     { level: 0, totalXp: 0, bonusRate: 1.0 },
      streak:       { days: 0, lastDate: '', best: 0 },
      medals:       [],
      xpBoost:      1.0,
      boostExpires: 0,
    }
  }

  static getXpMultiplier(meta: LevelingMeta, isPremium: boolean): number {
    const base      = 1.0
    const prestige  = 1 + meta.prestige.level * 0.1
    const boost     = Date.now() < meta.boostExpires ? meta.xpBoost : 1.0
    const weekend   = LevelingManager.isWeekend() ? 1.5 : 1.0
    const premium   = isPremium ? 1.5 : 1.0
    const streak    = meta.streak.days >= 7 ? 1.2 : meta.streak.days >= 3 ? 1.1 : 1.0
    return base * prestige * boost * weekend * premium * streak
  }

  static isWeekend(): boolean {
    const day = new Date().getDay()
    return day === 0 || day === 6
  }

  static applyMultiplier(baseXp: number, multiplier: number): number {
    return Math.floor(baseXp * multiplier)
  }

  static canPrestige(level: number): boolean { return level >= PRESTIGE_LEVEL_REQUIRED }

  static doPrestige(meta: LevelingMeta, currentXp: number): { newMeta: LevelingMeta; bonusXp: number } {
    const newPrestige = meta.prestige.level + 1
    const bonusXp     = newPrestige * 500
    const newMeta: LevelingMeta = {
      ...meta,
      prestige: {
        level:     newPrestige,
        totalXp:   meta.prestige.totalXp + currentXp,
        bonusRate: 1 + newPrestige * 0.1,
      },
    }
    return { newMeta, bonusXp }
  }

  static updateStreak(meta: LevelingMeta): { gained: boolean; broken: boolean } {
    const today = new Date().toISOString().slice(0, 10)
    if (meta.streak.lastDate === today) return { gained: false, broken: false }

    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)
    const cont      = meta.streak.lastDate === yesterday

    if (cont) {
      meta.streak.days++
      meta.streak.best     = Math.max(meta.streak.best, meta.streak.days)
      meta.streak.lastDate = today
      return { gained: true, broken: false }
    } else {
      const broken   = meta.streak.days > 0
      meta.streak.days     = 1
      meta.streak.lastDate = today
      return { gained: true, broken }
    }
  }

  static checkMedals(meta: LevelingMeta, level: number): Medal[] {
    const newMedals: Medal[] = []
    for (const medal of MEDALS) {
      if (!meta.medals.includes(medal.id) && medal.cond(meta, level)) {
        meta.medals.push(medal.id)
        newMedals.push(medal)
      }
    }
    return newMedals
  }

  static formatProfile(meta: LevelingMeta, level: number, isPremium: boolean): string {
    const mult    = LevelingManager.getXpMultiplier(meta, isPremium)
    const medals  = meta.medals
      .map(id => MEDALS.find(m => m.id === id))
      .filter(Boolean)
      .map(m => m!.emoji)
      .join('')

    const lines = [
      `*⭐ SISTEMA DE NIVELES AVANZADO*`,
      '',
      `📊 Nivel: ${level}  |  Prestigio: ${'⭐'.repeat(meta.prestige.level) || 'Ninguno'}`,
      `🔢 XP Total acumulado: ${meta.prestige.totalXp.toLocaleString()}`,
      `✨ Multiplicador actual: ×${mult.toFixed(2)}`,
      `🔥 Racha: ${meta.streak.days} días (mejor: ${meta.streak.best})`,
      `🏅 Medallas: ${medals || 'Ninguna'}`,
    ]

    if (Date.now() < meta.boostExpires) {
      const left = Math.ceil((meta.boostExpires - Date.now()) / 60_000)
      lines.push(`⚡ Boost activo: ×${meta.xpBoost} — ${left} min restantes`)
    }
    if (LevelingManager.isWeekend()) lines.push(`🎉 Bonus fin de semana: ×1.5 activo`)

    return lines.join('\n')
  }

  static prestigeTitle(level: number): string {
    const titles = [
      'Sin Prestigio', 'Renacido', 'Iluminado', 'Exaltado', 'Ascendido',
      'Eterno', 'Inmortal', 'Celestial', 'Divino', 'Absoluto', 'TRASCENDIDO',
    ]
    return titles[Math.min(level, 10)] ?? 'TRASCENDIDO'
  }
}
