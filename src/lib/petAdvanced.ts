// ─── Advanced Pet System ──────────────────────────────────────────────────────

export type PetRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary'

export interface PetSpecies {
  id:         string
  name:       string
  emoji:      string
  rarity:     PetRarity
  baseHp:     number
  baseAtk:    number
  baseDef:    number
  evolvesAt?: [number, string]   // [level, nextSpeciesId]
  desc:       string
}

export interface PetFullData {
  speciesId:   string
  name:        string
  level:       number
  exp:         number
  hp:          number
  maxHp:       number
  atk:         number
  def:         number
  hunger:      number    // 0-100 (100=lleno)
  happiness:   number    // 0-100
  energy:      number    // 0-100
  lastFed:     number
  lastPlayed:  number
  lastSlept:   number
  accessories: string[]
  wins:        number
  losses:      number
  generation:  number    // 1 = base, 2 = evolved once, 3 = max
}

export interface PetBattleState {
  id:          string
  challenger:  string   // owner JID
  opponent:    string
  petC:        PetFullData
  petO:        PetFullData
  turn:        string   // owner JID whose pet attacks
  log:         string[]
  startTime:   number
  active:      boolean
}

// ─── Species Catalog ──────────────────────────────────────────────────────────

export const PET_SPECIES: readonly PetSpecies[] = [
  // Common
  { id: 'slime',      name: 'Slime',      emoji: '🟢', rarity: 'common',    baseHp: 60,  baseAtk: 8,  baseDef: 5,  evolvesAt: [10, 'king_slime'],    desc: 'Pequeño y resistente' },
  { id: 'puppy',      name: 'Cachorro',   emoji: '🐶', rarity: 'common',    baseHp: 70,  baseAtk: 10, baseDef: 8,  evolvesAt: [10, 'wolf'],           desc: 'Fiel compañero' },
  { id: 'kitten',     name: 'Gatito',     emoji: '🐱', rarity: 'common',    baseHp: 65,  baseAtk: 12, baseDef: 6,  evolvesAt: [10, 'panther'],        desc: 'Ágil y curioso' },
  { id: 'bunny',      name: 'Conejito',   emoji: '🐰', rarity: 'common',    baseHp: 55,  baseAtk: 7,  baseDef: 7,  evolvesAt: [10, 'thunder_bunny'],  desc: 'Veloz saltador' },
  { id: 'baby_bird',  name: 'Pajarito',   emoji: '🐥', rarity: 'common',    baseHp: 50,  baseAtk: 9,  baseDef: 4,  evolvesAt: [10, 'harpy'],          desc: 'Vuela bajo' },
  { id: 'turtle',     name: 'Tortuga',    emoji: '🐢', rarity: 'common',    baseHp: 90,  baseAtk: 5,  baseDef: 18, evolvesAt: [10, 'armored_titan'],  desc: 'Lenta pero muy resistente' },
  // Uncommon
  { id: 'wolf',       name: 'Lobo',       emoji: '🐺', rarity: 'uncommon',  baseHp: 85,  baseAtk: 20, baseDef: 12, evolvesAt: [25, 'dire_wolf'],      desc: 'Cazador solitario' },
  { id: 'panther',    name: 'Pantera',    emoji: '🐈‍⬛', rarity: 'uncommon', baseHp: 80,  baseAtk: 22, baseDef: 10, evolvesAt: [25, 'shadow_cat'],     desc: 'Sigilosa y letal' },
  { id: 'king_slime', name: 'Slime Rey',  emoji: '👑', rarity: 'uncommon',  baseHp: 100, baseAtk: 15, baseDef: 15, evolvesAt: [25, 'slime_god'],      desc: 'El rey de los slimes' },
  { id: 'fox',        name: 'Zorro',      emoji: '🦊', rarity: 'uncommon',  baseHp: 75,  baseAtk: 18, baseDef: 11, evolvesAt: [25, 'nine_tail'],      desc: 'Astuto y rápido' },
  { id: 'harpy',      name: 'Arpía',      emoji: '🦅', rarity: 'uncommon',  baseHp: 70,  baseAtk: 20, baseDef: 9,  evolvesAt: [25, 'storm_eagle'],    desc: 'Señora del cielo' },
  // Rare
  { id: 'dire_wolf',  name: 'Lobo Oscuro',emoji: '🐺', rarity: 'rare',      baseHp: 120, baseAtk: 32, baseDef: 20, evolvesAt: [50, 'fenrir'],         desc: 'Terror de los bosques' },
  { id: 'nine_tail',  name: 'Nueve Colas',emoji: '🦊', rarity: 'rare',      baseHp: 100, baseAtk: 35, baseDef: 18, desc: 'Magia de zorro legendario' },
  { id: 'shadow_cat', name: 'Gato Sombra',emoji: '🐆', rarity: 'rare',      baseHp: 110, baseAtk: 38, baseDef: 15, evolvesAt: [50, 'void_panther'],   desc: 'Viaja entre sombras' },
  { id: 'griffin',    name: 'Grifo',      emoji: '🦁', rarity: 'rare',      baseHp: 130, baseAtk: 30, baseDef: 25, desc: 'Mitad águila, mitad león' },
  { id: 'kitsune',    name: 'Kitsune',    emoji: '🔮', rarity: 'rare',      baseHp: 95,  baseAtk: 40, baseDef: 16, desc: 'Espíritu zorro mágico' },
  // Epic
  { id: 'fenrir',     name: 'Fenrir',     emoji: '🐺', rarity: 'epic',      baseHp: 180, baseAtk: 55, baseDef: 35, desc: 'Lobo del apocalipsis' },
  { id: 'void_panther',name:'Pantera Vacío',emoji:'🖤', rarity: 'epic',     baseHp: 160, baseAtk: 60, baseDef: 30, desc: 'Consume la luz' },
  { id: 'slime_god',  name: 'Dios Slime', emoji: '✨', rarity: 'epic',      baseHp: 200, baseAtk: 45, baseDef: 45, desc: 'Forma definitiva del slime' },
  { id: 'leviathan',  name: 'Leviatán',   emoji: '🌊', rarity: 'epic',      baseHp: 220, baseAtk: 50, baseDef: 40, desc: 'Monstruo del mar profundo' },
  // Legendary
  { id: 'dragon',     name: 'Dragón',     emoji: '🐉', rarity: 'legendary', baseHp: 300, baseAtk: 80, baseDef: 60, desc: 'El rey de las criaturas' },
  { id: 'phoenix',    name: 'Fénix',      emoji: '🔥', rarity: 'legendary', baseHp: 250, baseAtk: 75, baseDef: 50, desc: 'Ave inmortal del fuego' },
  { id: 'unicorn',    name: 'Unicornio',  emoji: '🦄', rarity: 'legendary', baseHp: 280, baseAtk: 70, baseDef: 65, desc: 'Magia pura encarnada' },
  { id: 'cerberus',   name: 'Cerbero',    emoji: '🐕', rarity: 'legendary', baseHp: 350, baseAtk: 90, baseDef: 55, desc: 'Guardián del inframundo' },
]

const SPECIES_MAP = new Map(PET_SPECIES.map(s => [s.id, s]))

export const RARITY_EMOJI: Record<PetRarity, string> = {
  common:    '⚪',
  uncommon:  '🟢',
  rare:      '🔵',
  epic:      '🟣',
  legendary: '🌟',
}

export const RARITY_WEIGHT: Record<PetRarity, number> = {
  common:    50,
  uncommon:  25,
  rare:      15,
  epic:      8,
  legendary: 2,
}

// ─── In-memory battles ────────────────────────────────────────────────────────

const petBattles = new Map<string, PetBattleState>()

function rand(min: number, max: number) { return Math.floor(Math.random() * (max - min + 1)) + min }
function uid()                          { return Math.random().toString(36).slice(2, 10) }

// ─── Pet Manager ─────────────────────────────────────────────────────────────

export class PetManager {
  static getSpecies(id: string): PetSpecies | undefined { return SPECIES_MAP.get(id) }

  static randomSpecies(): PetSpecies {
    const total = Object.values(RARITY_WEIGHT).reduce((a, b) => a + b, 0)
    let roll    = Math.random() * total
    let rarity: PetRarity = 'common'
    for (const [r, w] of Object.entries(RARITY_WEIGHT) as [PetRarity, number][]) {
      roll -= w
      if (roll <= 0) { rarity = r; break }
    }
    const pool = PET_SPECIES.filter(s => s.rarity === rarity)
    return pool[Math.floor(Math.random() * pool.length)]!
  }

  static create(species: PetSpecies, name: string): PetFullData {
    return {
      speciesId:   species.id,
      name,
      level:       1,
      exp:         0,
      hp:          species.baseHp,
      maxHp:       species.baseHp,
      atk:         species.baseAtk,
      def:         species.baseDef,
      hunger:      100,
      happiness:   100,
      energy:      100,
      lastFed:     Date.now(),
      lastPlayed:  Date.now(),
      lastSlept:   Date.now(),
      accessories: [],
      wins:        0,
      losses:      0,
      generation:  1,
    }
  }

  static expForLevel(lvl: number): number { return Math.floor(50 * Math.pow(1.4, lvl)) }

  static addExp(pet: PetFullData, exp: number): { leveled: boolean; evolved: PetSpecies | null } {
    pet.exp += exp
    let leveled = false
    let evolved: PetSpecies | null = null

    while (pet.exp >= PetManager.expForLevel(pet.level)) {
      pet.exp -= PetManager.expForLevel(pet.level)
      pet.level++
      leveled = true

      const species = SPECIES_MAP.get(pet.speciesId)
      if (species?.evolvesAt && pet.level >= species.evolvesAt[0]) {
        const next = SPECIES_MAP.get(species.evolvesAt[1])
        if (next) {
          pet.speciesId = next.id
          pet.maxHp += 30
          pet.hp     = pet.maxHp
          pet.atk   += 8
          pet.def   += 6
          pet.generation++
          evolved = next
        }
      }
    }
    return { leveled, evolved }
  }

  static decayStats(pet: PetFullData): void {
    const now    = Date.now()
    const fedH   = (now - pet.lastFed)    / 3_600_000
    const playedH= (now - pet.lastPlayed) / 3_600_000
    const sleptH = (now - pet.lastSlept)  / 3_600_000

    pet.hunger    = Math.max(0, pet.hunger    - Math.floor(fedH    * 5))
    pet.happiness = Math.max(0, pet.happiness - Math.floor(playedH * 3))
    pet.energy    = Math.max(0, pet.energy    - Math.floor(sleptH  * 2))
  }

  static feed(pet: PetFullData): string {
    if (pet.hunger >= 90) return `_${pet.name} no tiene hambre._`
    const gain    = rand(20, 40)
    pet.hunger    = Math.min(100, pet.hunger + gain)
    pet.lastFed   = Date.now()
    return `🍖 *${pet.name}* comió con gusto. Hambre: ${pet.hunger}/100`
  }

  static play(pet: PetFullData): string {
    if (pet.energy < 20) return `_${pet.name} está muy cansado para jugar._`
    const gain      = rand(15, 30)
    pet.happiness   = Math.min(100, pet.happiness + gain)
    pet.energy      = Math.max(0,   pet.energy    - 15)
    pet.lastPlayed  = Date.now()
    return `🎾 *${pet.name}* jugó contigo. Felicidad: ${pet.happiness}/100`
  }

  static sleep(pet: PetFullData): string {
    if (pet.energy >= 90) return `_${pet.name} no tiene sueño._`
    pet.energy    = Math.min(100, pet.energy + rand(40, 60))
    pet.lastSlept = Date.now()
    return `💤 *${pet.name}* durmió un rato. Energía: ${pet.energy}/100`
  }

  static formatStatus(pet: PetFullData): string {
    const species = SPECIES_MAP.get(pet.speciesId)
    const bar     = (v: number) => '█'.repeat(Math.round(v/10)) + '░'.repeat(10 - Math.round(v/10))
    const xpNeeded = PetManager.expForLevel(pet.level)
    const rarEmoji = species ? RARITY_EMOJI[species.rarity] : '?'
    return [
      `*${species?.emoji ?? '?'} ${pet.name}* ${rarEmoji}`,
      `_${species?.name ?? pet.speciesId} — Nivel ${pet.level} — Gen. ${pet.generation}_`,
      '',
      `❤️ HP  [${bar(pet.hp / pet.maxHp * 100)}] ${pet.hp}/${pet.maxHp}`,
      `🍖 Hambre [${bar(pet.hunger)}] ${pet.hunger}/100`,
      `😊 Felicidad [${bar(pet.happiness)}] ${pet.happiness}/100`,
      `⚡ Energía [${bar(pet.energy)}] ${pet.energy}/100`,
      `✨ EXP: ${pet.exp}/${xpNeeded}`,
      `⚔️ ATK: ${pet.atk}  🛡️ DEF: ${pet.def}`,
      `🏆 Batallas: ${pet.wins}V / ${pet.losses}D`,
    ].join('\n')
  }

  // ─── Pet battles ───────────────────────────────────────────────────────────

  static startBattle(ownerA: string, ownerB: string, petA: PetFullData, petB: PetFullData): PetBattleState {
    const state: PetBattleState = {
      id:         uid(),
      challenger: ownerA,
      opponent:   ownerB,
      petC:       { ...petA },
      petO:       { ...petB },
      turn:       ownerA,
      log:        [],
      startTime:  Date.now(),
      active:     true,
    }
    petBattles.set(ownerA, state)
    petBattles.set(ownerB, state)
    return state
  }

  static getBattle(ownerJid: string): PetBattleState | undefined { return petBattles.get(ownerJid) }

  static autoRound(state: PetBattleState): { log: string; over: boolean; winner: string | null } {
    const isC     = state.turn === state.challenger
    const attacker= isC ? state.petC : state.petO
    const defender= isC ? state.petO : state.petC

    const dmg = Math.max(1, attacker.atk - Math.floor(defender.def * 0.5) + rand(-5, 5))
    if (isC) state.petO.hp = Math.max(0, state.petO.hp - dmg)
    else     state.petC.hp = Math.max(0, state.petC.hp - dmg)

    const log  = `${attacker.name} atacó → -${dmg} HP a ${defender.name}`
    const over = state.petC.hp <= 0 || state.petO.hp <= 0
    const winner = over ? (state.petC.hp <= 0 ? state.opponent : state.challenger) : null

    state.turn = isC ? state.opponent : state.challenger
    if (over) {
      petBattles.delete(state.challenger)
      petBattles.delete(state.opponent)
      state.active = false
    }
    return { log, over, winner }
  }
}
