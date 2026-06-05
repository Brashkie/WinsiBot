import type { WAMessage, WASocket, WAMessageKey } from '@whiskeysockets/baileys'

// ─── Contexto base de cada mensaje ───────────────────────────────────────────
export interface BotContext {
  msg:        WAMessage
  sock:       WASocket
  jid:        string
  text:       string
  args:       string[]
  isGroup:    boolean
  sender:     string
  pushName:   string
  isOwner:    boolean
  isAdmin:    boolean
  isBotAdmin: boolean
  prefix:     string
  command:    string
}

// ─── Comandos ─────────────────────────────────────────────────────────────────
export interface Command {
  name:         string
  aliases?:     string[]
  description:  string
  category:     CommandCategory
  cooldown?:    number
  adminOnly?:   boolean
  groupOnly?:   boolean
  ownerOnly?:   boolean
  premiumOnly?: boolean
  register?:    boolean
  level?:       number
  limit?:       number
  money?:       number
  exp?:         number
  execute(ctx: BotContext): Promise<void>
}

export type CommandCategory =
  | 'general'
  | 'media'
  | 'music'
  | 'scraper'
  | 'ai'
  | 'admin'
  | 'fun'
  | 'util'
  | 'downloader'
  | 'sticker'
  | 'roleplay'
  | 'nsfw'
  | 'info'
  | 'jadibot'
  | 'rpg'

// ─── Usuario ──────────────────────────────────────────────────────────────────
export interface UserProfile {
  jid:        string
  name:       string
  exp:        number
  level:      number
  money:      number
  diamonds:   number
  warns:      number
  banned:     boolean
  banReason:  string
  premium:    boolean
  registered: boolean
  spam:       number
  lastSpam:   number
}

// ─── Group Config ─────────────────────────────────────────────────────────────
export interface GroupConfig {
  jid:        string
  // moderacion
  antilink:   boolean
  antispam:   boolean
  antifake:   boolean
  antidelete: boolean
  modoadmin:  boolean
  anticall:   boolean
  // welcome
  welcome:    boolean
  detect:     boolean
  // misc
  nsfw:       boolean
  muted:      boolean
  // ia
  hepein:     boolean
}

// ─── Config ───────────────────────────────────────────────────────────────────
export interface BotConfig {
  prefix:               string[]
  botName:              string
  ownerJid:             string[]
  sessionPath:          string
  pythonApiUrl:         string
  phpApiUrl:            string
  rustApiUrl:           string
  openaiKey?:           string
  spotifyClientId?:     string
  spotifyClientSecret?: string
  databaseUrl?:         string
  redisUrl?:            string
  logLevel:             string
  isDev:                boolean
}

// ─── Jobs (BullMQ) ────────────────────────────────────────────────────────────
export interface MLJobData {
  type:    'predict' | 'analyze' | 'train'
  payload: Record<string, unknown>
}

export interface ScraperJobData {
  type: 'tiktok' | 'instagram' | 'youtube' | 'spotify'
  url:  string
  jid:  string
}

// ─── Respuestas Python API ────────────────────────────────────────────────────
export interface PythonApiResponse<T = unknown> {
  success: boolean
  data?:   T
  error?:  string
}

// ─── Roll / Gacha ─────────────────────────────────────────────────────────────
export interface RollCharacter {
  id:         number
  name:       string
  source:     string
  gender:     string
  value:      string | number
  image:      string
  vid?:       string
  status:     string
  user:       string | null
  votes:      number
  habilidad?: string
  debilidad?: string
}

export interface RollData {
  personajes: RollCharacter[]
}

// ─── Trade / Intercambio ──────────────────────────────────────────────────────
export interface TradeRequest {
  from:      string
  to:        string
  charFrom:  string
  charTo:    string
  jid:       string
  msgKey:    WAMessageKey
  expiresAt: number
}