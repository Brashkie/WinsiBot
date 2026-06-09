// ─── Avatar Library ───────────────────────────────────────────────────────────

export type AvatarRarity = 'common' | 'rare' | 'epic' | 'legendary'

export interface AvatarPart {
  id:     string
  name:   string
  emoji:  string
  rarity: AvatarRarity
}

export interface AvatarRecord {
  face:       string
  eyes:       string
  mouth:      string
  hair:       string
  accessory:  string
  background: string
  rarity:     AvatarRarity
  createdAt:  number
}

export interface AvatarInventory {
  unlocked:  string[]   // part IDs
  avatars:   AvatarRecord[]
  current?:  AvatarRecord
}

// ─── Part definitions ─────────────────────────────────────────────────────────

export const AVATAR_PARTS: Record<string, AvatarPart[]> = {
  face: [
    { id:'f1', name:'Redondo',     emoji:'😶', rarity:'common' },
    { id:'f2', name:'Ovalado',     emoji:'🙂', rarity:'common' },
    { id:'f3', name:'Cuadrado',    emoji:'😐', rarity:'rare' },
    { id:'f4', name:'Corazón',     emoji:'🥰', rarity:'epic' },
    { id:'f5', name:'Diamante',    emoji:'💎', rarity:'legendary' },
  ],
  eyes: [
    { id:'e1', name:'Normales',    emoji:'👀', rarity:'common' },
    { id:'e2', name:'Cerrados',    emoji:'😌', rarity:'common' },
    { id:'e3', name:'Guiño',       emoji:'😉', rarity:'rare' },
    { id:'e4', name:'Brillantes',  emoji:'✨', rarity:'epic' },
    { id:'e5', name:'Galácticos',  emoji:'🌌', rarity:'legendary' },
  ],
  mouth: [
    { id:'m1', name:'Sonrisa',     emoji:'😊', rarity:'common' },
    { id:'m2', name:'Seria',       emoji:'😑', rarity:'common' },
    { id:'m3', name:'Sorpresa',    emoji:'😮', rarity:'rare' },
    { id:'m4', name:'Carcajada',   emoji:'😂', rarity:'epic' },
    { id:'m5', name:'Dragón',      emoji:'🐉', rarity:'legendary' },
  ],
  hair: [
    { id:'h1', name:'Corto',       emoji:'👱', rarity:'common' },
    { id:'h2', name:'Largo',       emoji:'👩', rarity:'common' },
    { id:'h3', name:'Rizado',      emoji:'🧔', rarity:'rare' },
    { id:'h4', name:'Mohawk',      emoji:'🦸', rarity:'epic' },
    { id:'h5', name:'Corona',      emoji:'👑', rarity:'legendary' },
  ],
  accessory: [
    { id:'a0', name:'Ninguno',     emoji:'➖', rarity:'common' },
    { id:'a1', name:'Lentes',      emoji:'🕶️', rarity:'common' },
    { id:'a2', name:'Sombrero',    emoji:'🎩', rarity:'rare' },
    { id:'a3', name:'Máscara',     emoji:'🎭', rarity:'epic' },
    { id:'a4', name:'Halo',        emoji:'😇', rarity:'legendary' },
  ],
  background: [
    { id:'b1', name:'Básico',      emoji:'⬜', rarity:'common' },
    { id:'b2', name:'Naturaleza',  emoji:'🌿', rarity:'common' },
    { id:'b3', name:'Ciudad',      emoji:'🏙️', rarity:'rare' },
    { id:'b4', name:'Espacio',     emoji:'🌌', rarity:'epic' },
    { id:'b5', name:'Arcoíris',    emoji:'🌈', rarity:'legendary' },
  ],
}

const RARITY_WEIGHTS: Record<AvatarRarity, number> = {
  common:    60,
  rare:      25,
  epic:      12,
  legendary:  3,
}

const RARITY_EMOJI: Record<AvatarRarity, string> = {
  common:    '⚪',
  rare:      '🔵',
  epic:      '🟣',
  legendary: '🌟',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function weightedRarity(): AvatarRarity {
  const roll = Math.random() * 100
  let acc = 0
  for (const [rarity, weight] of Object.entries(RARITY_WEIGHTS) as [AvatarRarity, number][]) {
    acc += weight
    if (roll < acc) return rarity
  }
  return 'common'
}

function partsForRarity(category: string, rarity: AvatarRarity): AvatarPart[] {
  const parts = AVATAR_PARTS[category] ?? []
  const filtered = parts.filter(p => p.rarity === rarity)
  return filtered.length ? filtered : parts.filter(p => p.rarity === 'common')
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!
}

function overallRarity(parts: AvatarRarity[]): AvatarRarity {
  const score = { common: 0, rare: 1, epic: 2, legendary: 3 }
  const avg   = parts.reduce((s, r) => s + score[r], 0) / parts.length
  if (avg >= 2.5) return 'legendary'
  if (avg >= 1.5) return 'epic'
  if (avg >= 0.7) return 'rare'
  return 'common'
}

// ─── Avatar ───────────────────────────────────────────────────────────────────

export class Avatar {
  private parts: AvatarRecord

  constructor(parts?: Partial<AvatarRecord>) {
    if (parts && parts.face) {
      this.parts = {
        face:       parts.face!,
        eyes:       parts.eyes!,
        mouth:      parts.mouth!,
        hair:       parts.hair!,
        accessory:  parts.accessory!,
        background: parts.background!,
        rarity:     parts.rarity ?? 'common',
        createdAt:  parts.createdAt ?? Date.now(),
      }
    } else {
      this.parts = Avatar._random()
    }
  }

  static _random(): AvatarRecord {
    const rarity = weightedRarity()
    const face   = pick(partsForRarity('face', rarity))!
    const eyes   = pick(partsForRarity('eyes', rarity))!
    const mouth  = pick(partsForRarity('mouth', rarity))!
    const hair   = pick(partsForRarity('hair', rarity))!
    const acc    = pick(partsForRarity('accessory', rarity))!
    const bg     = pick(partsForRarity('background', rarity))!
    const actual = overallRarity([face.rarity, eyes.rarity, mouth.rarity, hair.rarity, acc.rarity, bg.rarity])

    return {
      face:       face.id,
      eyes:       eyes.id,
      mouth:      mouth.id,
      hair:       hair.id,
      accessory:  acc.id,
      background: bg.id,
      rarity:     actual,
      createdAt:  Date.now(),
    }
  }

  get data(): AvatarRecord { return { ...this.parts } }

  private partEmoji(category: string, id: string): string {
    return AVATAR_PARTS[category]?.find(p => p.id === id)?.emoji ?? '❓'
  }

  render(): string {
    const d = this.parts
    return [
      this.partEmoji('background', d.background),
      this.partEmoji('hair', d.hair),
      this.partEmoji('face', d.face),
      this.partEmoji('eyes', d.eyes),
      this.partEmoji('mouth', d.mouth),
      d.accessory !== 'a0' ? this.partEmoji('accessory', d.accessory) : '',
    ].filter(Boolean).join(' ')
  }

  toString(): string {
    const d   = this.parts
    const rar = `${RARITY_EMOJI[d.rarity]} ${d.rarity.charAt(0).toUpperCase() + d.rarity.slice(1)}`

    const label = (cat: string, id: string) => {
      const part = AVATAR_PARTS[cat]?.find(p => p.id === id)
      return part ? `${part.emoji} ${part.name}` : '❓'
    }

    return [
      `*AVATAR* ${rar}`,
      '',
      this.render(),
      '',
      `> Cara: ${label('face', d.face)}`,
      `> Ojos: ${label('eyes', d.eyes)}`,
      `> Boca: ${label('mouth', d.mouth)}`,
      `> Cabello: ${label('hair', d.hair)}`,
      `> Accesorio: ${label('accessory', d.accessory)}`,
      `> Fondo: ${label('background', d.background)}`,
    ].join('\n')
  }
}

// ─── AvatarManager ────────────────────────────────────────────────────────────

export class AvatarManager {
  static create(inv?: AvatarInventory): { avatar: AvatarRecord; inv: AvatarInventory } {
    const avatar = Avatar._random()
    const current = inv ?? { unlocked: [], avatars: [] }
    const updated: AvatarInventory = {
      unlocked: current.unlocked,
      avatars:  [...current.avatars, avatar],
      current:  avatar,
    }
    return { avatar, inv: updated }
  }

  static equip(inv: AvatarInventory, index: number): AvatarInventory {
    const avatar = inv.avatars[index]
    if (!avatar) throw new Error(`Avatar #${index + 1} no existe`)
    return { ...inv, current: avatar }
  }

  static gallery(inv: AvatarInventory): string {
    if (!inv.avatars.length) return '_No tienes avatares. Usa !avatar crear_'
    return inv.avatars.map((a, i) => {
      const av  = new Avatar(a)
      const rar = `${RARITY_EMOJI[a.rarity]}${a.rarity}`
      const cur = inv.current === a ? ' ◄ actual' : ''
      return `*${i + 1}.* ${av.render()}  _${rar}${cur}_`
    }).join('\n')
  }

  static renderCurrent(inv: AvatarInventory): string {
    if (!inv.current) return '_Sin avatar equipado_'
    return new Avatar(inv.current).toString()
  }

  static rarityLabel(rarity: AvatarRarity): string {
    return `${RARITY_EMOJI[rarity]} ${rarity.charAt(0).toUpperCase() + rarity.slice(1)}`
  }
}
