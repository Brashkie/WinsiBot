import type { WASocket } from '@whiskeysockets/baileys'

// ─── Tipos ────────────────────────────────────────────────────────────────────
export interface GroupConfig {
  // moderacion
  antilink:    boolean
  antispam:    boolean
  antifake:    boolean
  antibot:     boolean
  antidelete:  boolean
  // welcome
  welcome:     boolean
  sWelcome:    string
  sBye:        string
  sPromote:    string
  sDemote:     string
  // misc
  detect:      boolean
  modoadmin:   boolean
  nsfw:        boolean
  muted:       boolean
  anticall:    boolean
  // ia
  hepein:      boolean
}

export interface UserData {
  exp:        number
  level:      number
  money:      number
  diamonds:   number
  warns:      number
  banned:     boolean
  banReason:  string
  premium:    boolean
  registered: boolean
  name:       string
  lastSpam:   number
  spam:       number
}

// ─── Maps globales ────────────────────────────────────────────────────────────
export const groupConfigs = new Map<string, GroupConfig>()
export const userData     = new Map<string, UserData>()

// ─── Defaults ─────────────────────────────────────────────────────────────────
export function defaultGroupConfig(): GroupConfig {
  return {
    antilink:   false,
    antispam:   false,
    antifake:   false,
    antibot:    false,
    antidelete: false,
    welcome:    true,
    sWelcome:   '',
    sBye:       '',
    sPromote:   '',
    sDemote:    '',
    detect:     true,
    modoadmin:  false,
    nsfw:       false,
    muted:      false,
    anticall:   false,
    hepein:     false,   // ← IA desactivada por defecto
  }
}

export function defaultUserData(name = ''): UserData {
  return {
    exp:        0,
    level:      0,
    money:      100,
    diamonds:   10,
    warns:      0,
    banned:     false,
    banReason:  '',
    premium:    false,
    registered: false,
    name,
    lastSpam:   0,
    spam:       0,
  }
}

// ─── Getters ──────────────────────────────────────────────────────────────────
export function getGroupConfig(jid: string): GroupConfig {
  if (!groupConfigs.has(jid)) groupConfigs.set(jid, defaultGroupConfig())
  return groupConfigs.get(jid)!
}

export function getUserData(jid: string, name = ''): UserData {
  if (!userData.has(jid)) userData.set(jid, defaultUserData(name))
  return userData.get(jid)!
}

// ─── Setters ──────────────────────────────────────────────────────────────────
export function setGroupConfig(jid: string, config: Partial<GroupConfig>): void {
  groupConfigs.set(jid, { ...getGroupConfig(jid), ...config })
}

export function setUserData(jid: string, data: Partial<UserData>): void {
  userData.set(jid, { ...getUserData(jid), ...data })
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
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