// ─── PvP Arena System ─────────────────────────────────────────────────────────

export type Division =
  | 'Sin Rango' | 'Bronce' | 'Plata' | 'Oro'
  | 'Platino'   | 'Diamante' | 'Maestro' | 'Gran Maestro' | 'Legendario'

export type BattleAction = 'atacar' | 'poderoso' | 'defender' | 'curar' | 'ultimate'

export interface PvpProfile {
  elo:    number
  wins:   number
  losses: number
  draws:  number
  streak: number
  season: number
}

export interface ChallengeRequest {
  challenger: string
  opponent:   string
  bet:        number
  expires:    number
}

export interface BattleState {
  id:            string
  p1:            string
  p2:            string
  hp1:           number
  hp2:           number
  shield1:       number
  shield2:       number
  turn:          string
  round:         number
  log:           string[]
  bet:           number
  startTime:     number
  lastAction:    number
  ultimateUsed1: boolean
  ultimateUsed2: boolean
}

export interface ActionResult {
  log:    string
  over:   boolean
  winner: string | null
}

// ─── Constants ────────────────────────────────────────────────────────────────

export const MAX_HP = 100
const ELO_K           = 32
const CHALLENGE_TTL   = 60_000
const ACTION_TIMEOUT  = 2 * 60_000

const DIVISIONS: [Division, number][] = [
  ['Sin Rango',    0    ],
  ['Bronce',       800  ],
  ['Plata',        1000 ],
  ['Oro',          1200 ],
  ['Platino',      1400 ],
  ['Diamante',     1600 ],
  ['Maestro',      1800 ],
  ['Gran Maestro', 2000 ],
  ['Legendario',   2200 ],
]

const DIV_EMOJI: Record<Division, string> = {
  'Sin Rango':    '⬜',
  'Bronce':       '🟤',
  'Plata':        '🩶',
  'Oro':          '🟡',
  'Platino':      '🔵',
  'Diamante':     '💎',
  'Maestro':      '🟣',
  'Gran Maestro': '🔴',
  'Legendario':   '🌟',
}

// ─── In-memory state ──────────────────────────────────────────────────────────

const pendingChallenges = new Map<string, ChallengeRequest>()  // opponentJid → req
const activeBattles     = new Map<string, BattleState>()       // battleId → state
const userInBattle      = new Map<string, string>()            // userJid → battleId

// ─── Helpers ─────────────────────────────────────────────────────────────────

function rand(min: number, max: number) { return Math.floor(Math.random() * (max - min + 1)) + min }
function uid()                           { return Math.random().toString(36).slice(2, 10) }

// ─── Arena ───────────────────────────────────────────────────────────────────

export class Arena {
  static defaultProfile(): PvpProfile {
    return { elo: 1000, wins: 0, losses: 0, draws: 0, streak: 0, season: 1 }
  }

  static getDivision(elo: number): Division {
    let div: Division = 'Sin Rango'
    for (const [name, threshold] of DIVISIONS) {
      if (elo >= threshold) div = name
    }
    return div
  }

  static divEmoji(elo: number): string {
    return DIV_EMOJI[Arena.getDivision(elo)]
  }

  static formatProfile(p: PvpProfile, name: string): string {
    const div   = Arena.getDivision(p.elo)
    const total = p.wins + p.losses
    const wr    = total > 0 ? ((p.wins / total) * 100).toFixed(1) : '0.0'
    return [
      `*⚔️ PERFIL ARENA — ${name}*`,
      '',
      `${DIV_EMOJI[div]} División: *${div}*`,
      `📊 ELO: *${p.elo}*`,
      `✅ Victorias: ${p.wins}  ❌ Derrotas: ${p.losses}`,
      `🔥 Racha actual: ${p.streak}  |  Win rate: ${wr}%`,
    ].join('\n')
  }

  // ─── Challenge ─────────────────────────────────────────────────────────────

  static challenge(challenger: string, opponent: string, bet = 0): boolean {
    if (userInBattle.has(challenger) || userInBattle.has(opponent)) return false
    if (pendingChallenges.has(opponent)) return false
    const req: ChallengeRequest = { challenger, opponent, bet, expires: Date.now() + CHALLENGE_TTL }
    pendingChallenges.set(opponent, req)
    setTimeout(() => { if (pendingChallenges.get(opponent) === req) pendingChallenges.delete(opponent) }, CHALLENGE_TTL)
    return true
  }

  static getPendingChallenge(opponent: string): ChallengeRequest | undefined {
    const c = pendingChallenges.get(opponent)
    if (c && Date.now() > c.expires) { pendingChallenges.delete(opponent); return undefined }
    return c
  }

  static acceptChallenge(opponent: string): BattleState | null {
    const req = Arena.getPendingChallenge(opponent)
    if (!req) return null
    pendingChallenges.delete(opponent)

    const state: BattleState = {
      id:            uid(),
      p1:            req.challenger,
      p2:            req.opponent,
      hp1:           MAX_HP,
      hp2:           MAX_HP,
      shield1:       0,
      shield2:       0,
      turn:          req.challenger,
      round:         1,
      log:           [],
      bet:           req.bet,
      startTime:     Date.now(),
      lastAction:    Date.now(),
      ultimateUsed1: false,
      ultimateUsed2: false,
    }
    activeBattles.set(state.id, state)
    userInBattle.set(req.challenger, state.id)
    userInBattle.set(req.opponent,   state.id)

    setTimeout(() => {
      if (activeBattles.has(state.id)) Arena.endBattle(state)
    }, ACTION_TIMEOUT * 10)

    return state
  }

  static declineChallenge(opponent: string): boolean { return pendingChallenges.delete(opponent) }

  // ─── Battle ────────────────────────────────────────────────────────────────

  static getBattle(userJid: string): BattleState | undefined {
    const id = userInBattle.get(userJid)
    return id ? activeBattles.get(id) : undefined
  }

  static isInBattle(jid: string): boolean { return userInBattle.has(jid) }

  static processAction(state: BattleState, actor: string, action: BattleAction): ActionResult {
    const isP1      = actor === state.p1
    const myHp      = isP1 ? 'hp1'      : 'hp2'      as const
    const oppHp     = isP1 ? 'hp2'      : 'hp1'      as const
    const myShield  = isP1 ? 'shield1'  : 'shield2'  as const
    const oppShield = isP1 ? 'shield2'  : 'shield1'  as const
    const myUlt     = isP1 ? 'ultimateUsed1' : 'ultimateUsed2' as const

    let logEntry = ''

    switch (action) {
      case 'atacar': {
        const base = rand(8, 18)
        const dmg  = Math.max(1, base - state[oppShield])
        state[oppShield] = Math.max(0, state[oppShield] - 2)
        ;(state as any)[oppHp] -= dmg
        logEntry = `⚔️ *Ataque normal* → -${dmg} HP`
        break
      }
      case 'poderoso': {
        if (rand(1, 10) <= 3) {
          logEntry = `💥 *Golpe poderoso* → ¡Falló!`
        } else {
          const base = rand(18, 32)
          const dmg  = Math.max(1, base - state[oppShield])
          ;(state as any)[oppShield] = 0
          ;(state as any)[oppHp] -= dmg
          logEntry = `💥 *Golpe poderoso* → -${dmg} HP`
        }
        break
      }
      case 'defender': {
        const shield = rand(8, 16)
        ;(state as any)[myShield] = shield
        logEntry = `🛡️ *Defensa* → +${shield} escudo`
        break
      }
      case 'curar': {
        const heal = rand(10, 20)
        ;(state as any)[myHp] = Math.min(MAX_HP, state[myHp as keyof BattleState] as number + heal)
        logEntry = `💚 *Curación* → +${heal} HP`
        break
      }
      case 'ultimate': {
        if (state[myUlt]) {
          return { log: `❌ Ultimate ya fue usado`, over: false, winner: null }
        }
        const dmg = rand(30, 50)
        ;(state as any)[oppHp] -= dmg
        ;(state as any)[myHp]   = Math.min(MAX_HP, (state[myHp as keyof BattleState] as number) + 15)
        ;(state as any)[myUlt]  = true
        logEntry = `⚡ *ULTIMATE* → -${dmg} HP al rival, +15 HP propio`
        break
      }
    }

    state.hp1 = Math.max(0, state.hp1)
    state.hp2 = Math.max(0, state.hp2)

    const over   = state.hp1 <= 0 || state.hp2 <= 0
    const winner = over ? (state.hp1 <= 0 ? state.p2 : state.p1) : null

    if (!over) {
      state.turn       = isP1 ? state.p2 : state.p1
      state.round++
      state.lastAction = Date.now()
    }

    return { log: logEntry, over, winner }
  }

  static endBattle(state: BattleState): void {
    activeBattles.delete(state.id)
    userInBattle.delete(state.p1)
    userInBattle.delete(state.p2)
  }

  static formatStatus(state: BattleState, n1: string, n2: string): string {
    const bar = (hp: number) => '█'.repeat(Math.round(hp / MAX_HP * 10)) + '░'.repeat(10 - Math.round(hp / MAX_HP * 10))
    const isP1Turn = state.turn === state.p1
    return [
      `*⚔️ BATALLA — Ronda ${state.round}*`,
      '',
      `👤 ${n1}`,
      `❤️ [${bar(state.hp1)}] ${state.hp1}/${MAX_HP}  🛡️ ${state.shield1}`,
      '',
      `👤 ${n2}`,
      `❤️ [${bar(state.hp2)}] ${state.hp2}/${MAX_HP}  🛡️ ${state.shield2}`,
      '',
      `🎯 Turno de: *${isP1Turn ? n1 : n2}*`,
      `_Acciones: atacar · poderoso · defender · curar · ultimate_`,
    ].join('\n')
  }

  // ─── ELO ───────────────────────────────────────────────────────────────────

  static calcElo(winner: PvpProfile, loser: PvpProfile): [number, number] {
    const expected = 1 / (1 + Math.pow(10, (loser.elo - winner.elo) / 400))
    const delta    = Math.max(1, Math.round(ELO_K * (1 - expected)))
    return [winner.elo + delta, Math.max(100, loser.elo - delta)]
  }
}
