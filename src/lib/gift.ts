// ─── Gift System ──────────────────────────────────────────────────────────────

export type GiftRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary'

export interface GiftItem {
  id:      string
  name:    string
  emoji:   string
  rarity:  GiftRarity
  desc:    string
  value:   number
}

export interface GiftRecord {
  itemId:    string
  from:      string   // JID or 'anonymous'
  to:        string
  message:   string
  timestamp: number
  opened:    boolean
}

export interface TradeOffer {
  id:      string
  from:    string
  to:      string
  giving:  string   // item ID
  wanting: string   // item ID
  expires: number
}

export interface GiftInventory {
  inbox:    GiftRecord[]
  sent:     number
  wishlist: string[]
}

// ─── Catalog ─────────────────────────────────────────────────────────────────

export const GIFT_CATALOG: readonly GiftItem[] = [
  // Common
  { id: 'flower',     name: 'Flor',            emoji: '🌸', rarity: 'common',    desc: 'Una flor fresca',                 value: 50  },
  { id: 'candy',      name: 'Dulce',            emoji: '🍬', rarity: 'common',    desc: 'Dulce delicioso',                 value: 50  },
  { id: 'cookie',     name: 'Galleta',          emoji: '🍪', rarity: 'common',    desc: 'Galleta recién horneada',         value: 75  },
  { id: 'balloon',    name: 'Globo',            emoji: '🎈', rarity: 'common',    desc: 'Globo de colores',                value: 60  },
  { id: 'letter',     name: 'Carta',            emoji: '💌', rarity: 'common',    desc: 'Carta especial manuscrita',       value: 80  },
  { id: 'coffee',     name: 'Café',             emoji: '☕', rarity: 'common',    desc: 'Café caliente aromático',         value: 90  },
  { id: 'book',       name: 'Libro',            emoji: '📚', rarity: 'common',    desc: 'Libro interesante',               value: 100 },
  // Uncommon
  { id: 'cake',       name: 'Pastel',           emoji: '🎂', rarity: 'uncommon',  desc: 'Pastel de cumpleaños',            value: 200 },
  { id: 'rose',       name: 'Rosa roja',        emoji: '🌹', rarity: 'uncommon',  desc: 'Rosa de color rojo intenso',     value: 150 },
  { id: 'plushie',    name: 'Peluche',          emoji: '🧸', rarity: 'uncommon',  desc: 'Peluche adorable de colección',  value: 250 },
  { id: 'chocolate',  name: 'Chocolate',        emoji: '🍫', rarity: 'uncommon',  desc: 'Chocolate premium belga',        value: 180 },
  { id: 'music',      name: 'Playlist',         emoji: '🎵', rarity: 'uncommon',  desc: 'Playlist personalizada',         value: 200 },
  { id: 'candle',     name: 'Vela aromática',   emoji: '🕯️', rarity: 'uncommon',  desc: 'Vela de lavanda',                value: 160 },
  { id: 'painting',   name: 'Cuadro',           emoji: '🖼️', rarity: 'uncommon',  desc: 'Pintura artística exclusiva',    value: 300 },
  { id: 'tea',        name: 'Té especial',      emoji: '🍵', rarity: 'uncommon',  desc: 'Té de ceremonias',               value: 170 },
  // Rare
  { id: 'gem',        name: 'Gema brillante',   emoji: '💎', rarity: 'rare',      desc: 'Gema tallada a mano',            value: 500 },
  { id: 'potion',     name: 'Poción mágica',    emoji: '⚗️', rarity: 'rare',      desc: 'Poción de poder',                value: 450 },
  { id: 'trophy',     name: 'Trofeo',           emoji: '🏆', rarity: 'rare',      desc: 'Trofeo de campeón',              value: 600 },
  { id: 'ring',       name: 'Anillo elegante',  emoji: '💍', rarity: 'rare',      desc: 'Anillo de plata con grabado',    value: 700 },
  { id: 'ticket',     name: 'Ticket VIP',       emoji: '🎟️', rarity: 'rare',      desc: 'Acceso VIP exclusivo',           value: 550 },
  { id: 'lantern',    name: 'Linterna mágica',  emoji: '🏮', rarity: 'rare',      desc: 'Linterna que nunca se apaga',    value: 480 },
  { id: 'crystal',    name: 'Cristal arcano',   emoji: '🔮', rarity: 'rare',      desc: 'Cristal con energía mística',    value: 520 },
  // Epic
  { id: 'wings',      name: 'Alas mágicas',     emoji: '🪽', rarity: 'epic',      desc: 'Alas encantadas de ángel',       value: 1200 },
  { id: 'sword_epic', name: 'Espada Épica',     emoji: '⚔️', rarity: 'epic',      desc: 'Forjada en fuego eterno',        value: 1500 },
  { id: 'crown',      name: 'Corona dorada',    emoji: '👑', rarity: 'epic',      desc: 'Corona de la realeza',           value: 2000 },
  { id: 'shield',     name: 'Escudo Épico',     emoji: '🛡️', rarity: 'epic',      desc: 'Escudo de adamantio',            value: 1600 },
  { id: 'orb',        name: 'Orbe de poder',    emoji: '🌟', rarity: 'epic',      desc: 'Contiene energía cósmica',       value: 1800 },
  // Legendary
  { id: 'dragon_egg', name: 'Huevo de Dragón',  emoji: '🥚', rarity: 'legendary', desc: 'Huevo de dragón legendario',     value: 5000 },
  { id: 'holy_grail', name: 'Santo Grial',      emoji: '🏺', rarity: 'legendary', desc: 'El grial sagrado de la leyenda', value: 8000 },
  { id: 'star_shard', name: 'Fragmento Estelar',emoji: '✨', rarity: 'legendary', desc: 'Fragmento de una estrella',      value: 7000 },
  { id: 'phoenix',    name: 'Pluma de Fénix',   emoji: '🔥', rarity: 'legendary', desc: 'Pluma del ave inmortal',         value: 6500 },
  { id: 'arcane',     name: 'Tomo Arcano',      emoji: '📖', rarity: 'legendary', desc: 'Libro de magia suprema',         value: 9000 },
]

export const RARITY_EMOJI: Record<GiftRarity, string> = {
  common:    '⚪',
  uncommon:  '🟢',
  rare:      '🔵',
  epic:      '🟣',
  legendary: '🌟',
}

export const GIFT_COST: Record<GiftRarity, number> = {
  common:    50,
  uncommon:  200,
  rare:      500,
  epic:      1500,
  legendary: 5000,
}

const CATALOG_MAP = new Map(GIFT_CATALOG.map(i => [i.id, i]))

// ─── Active trades ────────────────────────────────────────────────────────────

const activeTrades = new Map<string, TradeOffer>()
const TRADE_TTL    = 5 * 60 * 1000

function uid() { return Math.random().toString(36).slice(2, 8).toUpperCase() }

// ─── Gift Manager ─────────────────────────────────────────────────────────────

export class GiftManager {
  static getItem(id: string): GiftItem | undefined { return CATALOG_MAP.get(id) }

  static defaultInventory(): GiftInventory {
    return { inbox: [], sent: 0, wishlist: [] }
  }

  static send(
    from:      string,
    to:        string,
    itemId:    string,
    message  = '',
    anonymous = false,
  ): GiftRecord | null {
    if (!CATALOG_MAP.has(itemId)) return null
    return {
      itemId,
      from:      anonymous ? 'anonymous' : from,
      to,
      message,
      timestamp: Date.now(),
      opened:    false,
    }
  }

  static open(record: GiftRecord): GiftItem | undefined {
    record.opened = true
    return CATALOG_MAP.get(record.itemId)
  }

  static proposeTrade(from: string, to: string, giving: string, wanting: string): TradeOffer | null {
    if (!CATALOG_MAP.has(giving) || !CATALOG_MAP.has(wanting)) return null
    const offer: TradeOffer = {
      id:      uid(),
      from,
      to,
      giving,
      wanting,
      expires: Date.now() + TRADE_TTL,
    }
    activeTrades.set(offer.id, offer)
    setTimeout(() => activeTrades.delete(offer.id), TRADE_TTL)
    return offer
  }

  static getTrade(id: string): TradeOffer | undefined {
    const t = activeTrades.get(id)
    if (t && Date.now() > t.expires) { activeTrades.delete(id); return undefined }
    return t
  }

  static getTradeForUser(jid: string): TradeOffer | undefined {
    for (const t of activeTrades.values()) {
      if ((t.from === jid || t.to === jid) && Date.now() < t.expires) return t
    }
    return undefined
  }

  static cancelTrade(id: string): boolean { return activeTrades.delete(id) }

  static formatCatalog(filter?: GiftRarity): string {
    const by: Record<GiftRarity, GiftItem[]> = {
      common: [], uncommon: [], rare: [], epic: [], legendary: []
    }
    const items = filter ? GIFT_CATALOG.filter(i => i.rarity === filter) : GIFT_CATALOG
    for (const i of items) by[i.rarity].push(i)

    const lines = ['*🎁 CATÁLOGO DE REGALOS*', '']
    const order: GiftRarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary']
    for (const r of order) {
      const list = by[r]
      if (!list.length) continue
      lines.push(`${RARITY_EMOJI[r]} *${r.toUpperCase()}* — costo: ${GIFT_COST[r].toLocaleString()} monedas`)
      for (const i of list) lines.push(`  ${i.emoji} \`${i.id}\` — ${i.name}`)
      lines.push('')
    }
    return lines.join('\n').trimEnd()
  }

  static formatInbox(inbox: GiftRecord[]): string {
    if (!inbox.length) return '_Tu buzón está vacío._'
    const recent = [...inbox].sort((a, b) => b.timestamp - a.timestamp).slice(0, 10)
    const unopened = inbox.filter(r => !r.opened).length
    const lines = [`*📬 BUZÓN* (${unopened} sin abrir / ${inbox.length} total)`, '']
    for (let i = 0; i < recent.length; i++) {
      const r    = recent[i]!
      const item = CATALOG_MAP.get(r.itemId)
      const from = r.from === 'anonymous' ? '_Anónimo_' : `+${r.from.split('@')[0]}`
      lines.push(`${i + 1}. ${r.opened ? '✅' : '📦'} ${item?.emoji ?? '?'} *${item?.name ?? r.itemId}* de ${from}`)
      if (r.message) lines.push(`   _"${r.message}"_`)
    }
    lines.push('', `_!regalo abrir <N>_`)
    return lines.join('\n')
  }
}
