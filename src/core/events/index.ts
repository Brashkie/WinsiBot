// ─────────────────────────────────────────────────────────────────────────────
// TIPOS
// ─────────────────────────────────────────────────────────────────────────────

// ─── Mascota activa del usuario ───────────────────────────────────────────────
export type PetType =
  | 'none' | 'dog' | 'cat' | 'fox' | 'horse'
  | 'dragon' | 'phoenix' | 'centaur' | 'legendary'

export interface PetData {
  type:    PetType
  name:    string
  level:   number
  exp:     number
  health:  number    // 0-100
  hunger:  number    // 0-100 (100=lleno)
  lastFed: number    // timestamp
}

// ─── Inventario de ítems ──────────────────────────────────────────────────────
export interface ItemInventory {
  sword:        number   // espadas
  spada:        number   // espadas especiales
  pc:           number   // pociones de curación
  sp:           number   // puntos de magia
  legendary:    number   // objetos legendarios
  stickerPack:  string   // nombre del pack de stickers
}

// ─── Cooldowns de actividades RPG ────────────────────────────────────────────
export interface Cooldowns {
  lastWork:      number
  lastDaily:     number
  lastWeekly:    number
  lastMonthly:   number
  lastYearly:    number
  lastAdventure: number
  lastMining:    number
  lastFishing:   number
  lastHunt:      number
  lastDungeon:   number
  lastFight:     number
  lastDuel:      number
  lastRob:       number
  lastClaim:     number
  lastBet:       number
  lastCofre:     number
  lastCrime:     number
  lastGift:      number
  lastReward:    number
  lastCode:      number
}

// ─── Perfil del usuario ───────────────────────────────────────────────────────
export interface UserProfile {
  age:         number     // -1 si no registrado
  genre:       string     // 'm' | 'f' | ''
  birth:       string     // 'DD/MM'
  marry:       string     // JID del cónyuge
  description: string
  regTime:     number     // timestamp de registro
  afk:         number     // timestamp (-1 si no está AFK)
  afkReason:   string
  role:        string     // 'Novato' | 'Guerrero' | 'Héroe' | 'Leyenda' ...
}

// ─── Datos completos del usuario ──────────────────────────────────────────────
export interface UserData {
  // ── Básicos ────────────────────────────────────────────────────────────────
  name:         string
  exp:          number
  level:        number
  money:        number
  bank:         number
  diamonds:     number
  health:       number    // 0-100
  crime:        number    // puntos de criminalidad
  // ── Estado ─────────────────────────────────────────────────────────────────
  warns:        number
  banned:       boolean
  banReason:    string
  muted:        boolean
  premium:      boolean
  premiumTime:  number    // timestamp de expiración (0 = no premium)
  registered:   boolean
  autoLevelUp:  boolean
  // ── Anti-spam interno ──────────────────────────────────────────────────────
  spam:         number
  lastSpam:     number
  // ── Perfil ─────────────────────────────────────────────────────────────────
  profile:      UserProfile
  // ── Mascota ────────────────────────────────────────────────────────────────
  pet:          PetData
  // ── Inventario ─────────────────────────────────────────────────────────────
  items:        ItemInventory
  // ── Cooldowns ──────────────────────────────────────────────────────────────
  cooldowns:    Cooldowns
}

// ─── Configuración de grupo ───────────────────────────────────────────────────
export interface GroupConfig {
  // ── Moderación ─────────────────────────────────────────────────────────────
  antilink:      boolean
  antilink2:     boolean   // más agresivo (solo admins pueden enviar links)
  antispam:      boolean
  antiflood:     boolean
  antifake:      boolean   // números falsos / virtuales
  antibot:       boolean
  antidelete:    boolean
  antitoxic:     boolean   // palabras ofensivas
  antitraba:     boolean   // mensajes que traban el chat
  // ── Anti-plataformas ───────────────────────────────────────────────────────
  antitelegram:  boolean
  antidiscord:   boolean
  antitiktok:    boolean
  antiyoutube:   boolean
  // ── Bienvenida ─────────────────────────────────────────────────────────────
  welcome:       boolean
  sWelcome:      string
  sBye:          string
  sPromote:      string
  sDemote:       string
  // ── Funciones activas ──────────────────────────────────────────────────────
  detect:        boolean   // notificar cambios (desc, nombre, etc.)
  modoadmin:     boolean   // solo admins usan comandos
  nsfw:          boolean
  muted:         boolean   // bot silenciado en el grupo
  anticall:      boolean
  hepein:        boolean   // IA en el grupo
  game:          boolean   // juegos permitidos
  rpg:           boolean   // comandos RPG permitidos
  reaction:      boolean   // reacciones automáticas
  autosticker:   boolean   // convertir imágenes a sticker automáticamente
  viewonce:      boolean   // reenviar view-once del grupo
  autoresponder: boolean   // respuestas automáticas
  sAutoresponder: string   // texto del autoresponder
  audios:        boolean   // comandos de audio permitidos
  // ── Solicitudes ────────────────────────────────────────────────────────────
  autoAccept:    boolean   // aceptar solicitudes de unirse automáticamente
  autoReject:    boolean   // rechazar solicitudes automáticamente
  // ── Expiración ─────────────────────────────────────────────────────────────
  expired:       number    // timestamp (0 = sin expiración)
}

// ─── Clan ─────────────────────────────────────────────────────────────────────
export interface ClanData {
  name:        string
  tag:         string        // etiqueta corta, ej: [WB]
  description: string
  leader:      string        // JID del líder
  coleaders:   string[]      // JIDs de co-líderes
  members:     string[]      // JIDs de todos los miembros
  level:       number
  exp:         number
  points:      number
  wins:        number
  losses:      number
  createdAt:   number        // timestamp
  icon:        string        // emoji de ícono
  isOpen:      boolean       // acepta miembros sin invitación
}

// ─────────────────────────────────────────────────────────────────────────────
// MAPS GLOBALES
// ─────────────────────────────────────────────────────────────────────────────

export const groupConfigs = new Map<string, GroupConfig>()
export const userData     = new Map<string, UserData>()
export const clanData     = new Map<string, ClanData>()    // clanTag → ClanData
export const userClan     = new Map<string, string>()      // userJid → clanTag

// ─────────────────────────────────────────────────────────────────────────────
// DEFAULTS
// ─────────────────────────────────────────────────────────────────────────────

export function defaultPet(): PetData {
  return {
    type:    'none',
    name:    '',
    level:   0,
    exp:     0,
    health:  100,
    hunger:  100,
    lastFed: 0,
  }
}

export function defaultItems(): ItemInventory {
  return {
    sword:       0,
    spada:       0,
    pc:          0,
    sp:          0,
    legendary:   0,
    stickerPack: '',
  }
}

export function defaultCooldowns(): Cooldowns {
  return {
    lastWork:      0,
    lastDaily:     0,
    lastWeekly:    0,
    lastMonthly:   0,
    lastYearly:    0,
    lastAdventure: 0,
    lastMining:    0,
    lastFishing:   0,
    lastHunt:      0,
    lastDungeon:   0,
    lastFight:     0,
    lastDuel:      0,
    lastRob:       0,
    lastClaim:     0,
    lastBet:       0,
    lastCofre:     0,
    lastCrime:     0,
    lastGift:      0,
    lastReward:    0,
    lastCode:      0,
  }
}

export function defaultProfile(_name = ''): UserProfile {
  return {
    age:         -1,
    genre:       '',
    birth:       '',
    marry:       '',
    description: '',
    regTime:     -1,
    afk:         -1,
    afkReason:   '',
    role:        'Novato',
  }
}

export function defaultUserData(name = ''): UserData {
  return {
    name,
    exp:          0,
    level:        0,
    money:        100,
    bank:         0,
    diamonds:     10,
    health:       100,
    crime:        0,
    warns:        0,
    banned:       false,
    banReason:    '',
    muted:        false,
    premium:      false,
    premiumTime:  0,
    registered:   false,
    autoLevelUp:  true,
    spam:         0,
    lastSpam:     0,
    profile:      defaultProfile(name),
    pet:          defaultPet(),
    items:        defaultItems(),
    cooldowns:    defaultCooldowns(),
  }
}

export function defaultGroupConfig(): GroupConfig {
  return {
    antilink:      false,
    antilink2:     false,
    antispam:      false,
    antiflood:     false,
    antifake:      false,
    antibot:       true,
    antidelete:    false,
    antitoxic:     false,
    antitraba:     false,
    antitelegram:  false,
    antidiscord:   false,
    antitiktok:    false,
    antiyoutube:   false,
    welcome:       true,
    sWelcome:      '',
    sBye:          '',
    sPromote:      '',
    sDemote:       '',
    detect:        true,
    modoadmin:     false,
    nsfw:          false,
    muted:         false,
    anticall:      false,
    hepein:        false,
    game:          true,
    rpg:           true,
    reaction:      false,
    autosticker:   false,
    viewonce:      false,
    autoresponder: false,
    sAutoresponder: '',
    audios:        true,
    autoAccept:    false,
    autoReject:    false,
    expired:       0,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GETTERS / SETTERS — Usuarios
// ─────────────────────────────────────────────────────────────────────────────

export function getUserData(jid: string, name = ''): UserData {
  if (!userData.has(jid)) userData.set(jid, defaultUserData(name))
  const u = userData.get(jid)!
  // Rellenar sub-objetos si vienen de una versión anterior sin ellos
  if (!u.profile)   u.profile   = defaultProfile(u.name)
  if (!u.pet)       u.pet       = defaultPet()
  if (!u.items)     u.items     = defaultItems()
  if (!u.cooldowns) u.cooldowns = defaultCooldowns()
  return u
}

export function setUserData(jid: string, data: Partial<UserData>): void {
  userData.set(jid, { ...getUserData(jid), ...data })
}

export function patchUserData(jid: string, patch: DeepPartial<UserData>): void {
  const u = getUserData(jid)
  userData.set(jid, deepMerge(u, patch) as UserData)
}

// ─────────────────────────────────────────────────────────────────────────────
// GETTERS / SETTERS — Grupos
// ─────────────────────────────────────────────────────────────────────────────

export function getGroupConfig(jid: string): GroupConfig {
  if (!groupConfigs.has(jid)) groupConfigs.set(jid, defaultGroupConfig())
  return groupConfigs.get(jid)!
}

export function setGroupConfig(jid: string, config: Partial<GroupConfig>): void {
  groupConfigs.set(jid, { ...getGroupConfig(jid), ...config })
}

// ─────────────────────────────────────────────────────────────────────────────
// GETTERS / SETTERS — Clanes
// ─────────────────────────────────────────────────────────────────────────────

export function getClan(tag: string): ClanData | undefined {
  return clanData.get(tag.toUpperCase())
}

export function getUserClan(jid: string): ClanData | undefined {
  const tag = userClan.get(jid)
  return tag ? getClan(tag) : undefined
}

export function createClan(leader: string, name: string, tag: string, icon = '⚔️'): ClanData | null {
  const key = tag.toUpperCase()
  if (clanData.has(key)) return null   // ya existe
  if (userClan.has(leader)) return null // el líder ya está en un clan

  const clan: ClanData = {
    name,
    tag:         key,
    description: '',
    leader,
    coleaders:   [],
    members:     [leader],
    level:       1,
    exp:         0,
    points:      0,
    wins:        0,
    losses:      0,
    createdAt:   Date.now(),
    icon,
    isOpen:      false,
  }
  clanData.set(key, clan)
  userClan.set(leader, key)
  return clan
}

export function joinClan(jid: string, tag: string): boolean {
  const clan = getClan(tag)
  if (!clan || userClan.has(jid)) return false
  clan.members.push(jid)
  userClan.set(jid, tag.toUpperCase())
  return true
}

export function leaveClan(jid: string): boolean {
  const tag = userClan.get(jid)
  if (!tag) return false
  const clan = getClan(tag)
  if (!clan) return false

  clan.members = clan.members.filter(m => m !== jid)
  clan.coleaders = clan.coleaders.filter(m => m !== jid)
  userClan.delete(jid)

  // Si se va el líder y hay miembros, pasa el liderazgo al siguiente
  if (clan.leader === jid) {
    if (clan.coleaders.length > 0) {
      clan.leader = clan.coleaders.shift()!
    } else if (clan.members.length > 0) {
      clan.leader = clan.members[0]!
    } else {
      // Clan vacío, eliminar
      clanData.delete(tag)
    }
  }
  return true
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS COOLDOWN
// ─────────────────────────────────────────────────────────────────────────────

type CooldownKey = keyof Cooldowns

export function isOnCooldown(jid: string, key: CooldownKey, ms: number): boolean {
  const u = getUserData(jid)
  return Date.now() - (u.cooldowns[key] ?? 0) < ms
}

export function getCooldownLeft(jid: string, key: CooldownKey, ms: number): number {
  const u = getUserData(jid)
  return Math.max(0, ms - (Date.now() - (u.cooldowns[key] ?? 0)))
}

export function setCooldown(jid: string, key: CooldownKey): void {
  const u = getUserData(jid)
  u.cooldowns[key] = Date.now()
}

/** Formatea ms en '2h 30m 15s' */
export function fmtCooldown(ms: number): string {
  const s = Math.floor(ms / 1000)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return [h && `${h}h`, m && `${m}m`, sec && `${sec}s`].filter(Boolean).join(' ') || '0s'
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS VARIOS
// ─────────────────────────────────────────────────────────────────────────────

export function getNumber(jid: string): string {
  return jid
    .replace('@s.whatsapp.net', '')
    .replace('@lid', '')
    .replace('@g.us', '')
    .replace(/[^0-9]/g, '')
}

export function isGroupJid(jid: string): boolean {
  return jid.endsWith('@g.us')
}

/** EXP necesaria para pasar al siguiente nivel */
export function expForLevel(level: number): number {
  return Math.floor(100 * Math.pow(1.5, level))
}

/** Sube de nivel si tiene suficiente EXP. Devuelve cuántos niveles subió. */
export function checkLevelUp(jid: string): number {
  const u = getUserData(jid)
  let leveled = 0
  while (u.exp >= expForLevel(u.level)) {
    u.exp -= expForLevel(u.level)
    u.level++
    leveled++
  }
  return leveled
}

// ─────────────────────────────────────────────────────────────────────────────
// UTILIDADES INTERNAS
// ─────────────────────────────────────────────────────────────────────────────

type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] }

function deepMerge(target: any, source: any): any {
  const out = { ...target }
  for (const key of Object.keys(source ?? {})) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      out[key] = deepMerge(target[key] ?? {}, source[key])
    } else {
      out[key] = source[key]
    }
  }
  return out
}
