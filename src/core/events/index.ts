// ─────────────────────────────────────────────────────────────────────────────
// TIPOS
// ─────────────────────────────────────────────────────────────────────────────

// ─── Dragones (Dragon City, #pet) ─────────────────────────────────────────────
export interface OwnedDragon {
  id:          number   // referencia a DragonDef.id en @lib/dragoncity.ts
  slug:        string
  name:        string   // nombre personalizado (por defecto el de la especie)
  level:       number
  exp:         number
  stage:       0 | 1 | 3
  hatchedAt:   number
  lastCollect: number   // última recolección de Oro pasivo
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

// ─── Negocios comprados (#business/#collect) ─────────────────────────────────
export interface OwnedBusiness {
  id:          string   // referencia a BusinessDef.id en @lib/business.ts
  boughtAt:    number
  lastCollect: number
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
  lastAscuas:    number
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
  embers:       number   // BrasEmbers — moneda rara, cuesta usarla en comandos NSFW
  businesses:   OwnedBusiness[]   // negocios comprados — #business/#collect
  oro:          number   // Oro (Dragon City) — se gana con los dragones, se gasta alimentándolos
  dragons:      OwnedDragon[]     // colección de dragones — #pet
  health:       number    // 0-100
  crime:        number    // puntos de criminalidad
  commandsUsed: number    // total de comandos ejecutados
  // ── Estado ─────────────────────────────────────────────────────────────────
  warns:        number
  banned:       boolean
  banReason:    string
  muted:        boolean
  premium:      boolean
  premiumTime:  number    // timestamp de expiración (0 = no premium)
  autoLevelUp:  boolean
  // ── Anti-spam interno ──────────────────────────────────────────────────────
  spam:         number
  lastSpam:     number
  // ── Perfil ─────────────────────────────────────────────────────────────────
  profile:      UserProfile
  // ── Inventario ─────────────────────────────────────────────────────────────
  items:        ItemInventory
  // ── Cooldowns ──────────────────────────────────────────────────────────────
  cooldowns:    Cooldowns
  // ── Avatar ─────────────────────────────────────────────────────────────────
  avatar?:       import('@lib/avatar.js').AvatarInventory
  // ── Gift System ─────────────────────────────────────────────────────────────
  giftInbox?:    import('@lib/gift.js').GiftInventory
  // ── PvP Arena ───────────────────────────────────────────────────────────────
  pvp?:          import('@lib/pvp.js').PvpProfile
  // ── Coding Quiz ─────────────────────────────────────────────────────────────
  quizProfile?:  import('@lib/quiz.js').QuizProfile
  // ── Leveling avanzado ───────────────────────────────────────────────────────
  levelingMeta?: import('@lib/leveling.js').LevelingMeta
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
  autolevelup:   boolean   // anuncia en el chat cuando alguien sube de nivel
  // ── Solicitudes ────────────────────────────────────────────────────────────
  autoAccept:    boolean   // aceptar solicitudes de unirse automáticamente
  autoReject:    boolean   // rechazar solicitudes automáticamente
  // ── Captcha de bienvenida ──────────────────────────────────────────────────
  captcha:       boolean   // verificación captcha al unirse
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
    lastAscuas:    0,
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
    money:        1000,
    bank:         0,
    diamonds:     10,
    embers:       0,
    businesses:   [],
    oro:          0,
    dragons:      [],
    health:       100,
    crime:        0,
    commandsUsed: 0,
    warns:        0,
    banned:       false,
    banReason:    '',
    muted:        false,
    premium:      false,
    premiumTime:  0,
    autoLevelUp:  true,
    spam:         0,
    lastSpam:     0,
    profile:      defaultProfile(name),
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
    autolevelup:   false,
    autoAccept:    false,
    autoReject:    false,
    captcha:       false,
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
  if (!u.items)     u.items     = defaultItems()
  if (!u.cooldowns) u.cooldowns = defaultCooldowns()
  if (u.embers === undefined) u.embers = 0
  if (!u.businesses) u.businesses = []
  if (u.oro === undefined) u.oro = 0
  if (!u.dragons) u.dragons = []
  return u
}

export function setUserData(jid: string, data: Partial<UserData>): void {
  userData.set(jid, { ...getUserData(jid), ...data })
}

/** Cobra `cost` BrasEmbers a `sender` — usado por los comandos NSFW, que
 *  además del toggle #on nsfw del grupo (controla si el GRUPO permite NSFW)
 *  ahora también requieren que el USUARIO tenga esta moneda rara. Devuelve
 *  true y descuenta si le alcanza; false y no toca nada si no le alcanza —
 *  el comando que llama a esto debe avisarle al usuario en el caso false. */
export function chargeEmbers(sender: string, cost: number): boolean {
  const u = getUserData(sender)
  if (u.embers < cost) return false
  setUserData(sender, { embers: u.embers - cost })
  return true
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

// ─── Cooldowns "diarios" (resetean a medianoche, no 24h rodantes) ─────────────
// Para comandos tipo #daily/#chest: en vez de esperar 24h exactas desde el
// último uso, quedan disponibles de nuevo al llegar la medianoche — así todos
// los usuarios resetean al mismo momento del día, sin importar a qué hora
// reclamaron. Usa el mismo timestamp de `cooldowns` (setCooldown de arriba),
// solo cambia cómo se interpreta.
//
// El "día" se calcula en UTC (no hora local del servidor) a propósito: la
// racha de #daily (LevelingManager.updateStreak, en leveling.ts) ya compara
// fechas con `toISOString().slice(0,10)`, que es UTC. Si este cooldown usara
// hora local y el servidor no corre en UTC, el gate del comando y el avance
// de racha "verían" el cambio de día en momentos distintos — desincronizado.

export function isOnCooldownDaily(jid: string, key: CooldownKey): boolean {
  const last = getUserData(jid).cooldowns[key] ?? 0
  if (!last) return false
  return new Date(last).toISOString().slice(0, 10) === new Date().toISOString().slice(0, 10)
}

/** ms hasta la próxima medianoche UTC — mismo valor para cualquier usuario en el mismo instante. */
export function getDailyCooldownLeft(): number {
  const now             = new Date()
  const nextUtcMidnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)
  return Math.max(0, nextUtcMidnight - now.getTime())
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

/** EXP necesaria para pasar al siguiente nivel — crece con el nivel pero no explota.
 *  Antes era 100 * 1.5^nivel: pasado el nivel ~22 se volvía matemáticamente
 *  imposible (a nivel 100 hacían falta más XP que el que existe en toda la
 *  economía del bot), pese a que ranks.ts tiene rangos hasta nivel 400.
 *  Esta curva (80 * (nivel+1)^1.7) sigue siendo más difícil en cada nivel,
 *  pero nivel 400 sigue siendo alcanzable a largo plazo. */
export function expForLevel(level: number): number {
  return Math.floor(80 * Math.pow(level + 1, 1.7))
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

// Grupos con autolevelup apagado no deben ver el aviso de subida de nivel en
// NINGÚN lado — ni embebido en la respuesta del comando (work/crime/mine/
// daily/weekly/monthly/chest) ni en el anuncio centralizado de handler.ts.
// Antes cada uno de esos comandos llamaba levelUpLine() sin chequear la
// config del grupo, así que el aviso aparecía SIEMPRE sin importar el
// toggle (o su valor por defecto, que es `false`) — coincide con lo
// reportado: "desactivé el level y sigue apareciendo". En DMs (sin grupo)
// no aplica ningún toggle de grupo, así que se muestra siempre, igual que
// ya hacía el chequeo centralizado en handler.ts (`groupCfg === null`).
function canAnnounceLevelUp(jid: string): boolean {
  if (!jid.endsWith('@g.us')) return true
  return getGroupConfig(jid).autolevelup
}

/** Línea de "subiste de nivel" para anexar a la respuesta de un comando —
 *  '' si leveled es 0 o si el grupo tiene autolevelup desactivado. */
export function levelUpLine(leveled: number, jid: string): string {
  return leveled > 0 && canAnnounceLevelUp(jid) ? `\n> ◆ *¡Subiste ${leveled} nivel(es)!*` : ''
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
