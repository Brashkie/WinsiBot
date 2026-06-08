// ─────────────────────────────────────────────────────────────────────────────
//  WinsiBot — SISTEMA DE ROLES GLOBAL
//  Agrega JIDs aquí para dar permisos especiales sin tocar el .env
// ─────────────────────────────────────────────────────────────────────────────

import { config } from '../config.js'

// ─── Tipos ────────────────────────────────────────────────────────────────────

/** [jid_prefix_o_jid_completo, etiqueta, activo] */
export type RoleEntry = [string, string, boolean]
/** [jid_prefix_o_jid_completo, etiqueta] */
export type DevEntry  = [string, string]
/** Premio con expiración opcional (0 = vitalicio) */
export type PremEntry = { jid: string; label: string; expiry: number }

// ─────────────────────────────────────────────────────────────────────────────
//  NIVEL 1: ADMINISTRACIÓN
// ─────────────────────────────────────────────────────────────────────────────
export const owners: RoleEntry[] = [
  // ['51912345678', '🌐 Creator', true],
]

// ─────────────────────────────────────────────────────────────────────────────
//  NIVEL 2: DESARROLLO
// ─────────────────────────────────────────────────────────────────────────────
export const devs: DevEntry[] = [
  // ['51987654321', 'dev'],
]

// ─────────────────────────────────────────────────────────────────────────────
//  NIVEL 3: MODERACIÓN
// ─────────────────────────────────────────────────────────────────────────────
export const mods: RoleEntry[] = [
  // ['5191XXXXXXX', '🛡️ Luis', true],
]

// ─────────────────────────────────────────────────────────────────────────────
//  NIVEL 4: ASISTENCIA
// ─────────────────────────────────────────────────────────────────────────────
export const helpers: string[] = []

// ─────────────────────────────────────────────────────────────────────────────
//  NIVEL 5: COMUNIDAD
// ─────────────────────────────────────────────────────────────────────────────
export const contributors: string[] = []
export const betaTesters:  string[] = []
export const donators:     string[] = []
export const partners:     string[] = []
export const influencers:  string[] = []

// ─────────────────────────────────────────────────────────────────────────────
//  NIVEL 6: PREMIUM
// ─────────────────────────────────────────────────────────────────────────────
export const prems: PremEntry[] = []

// ─────────────────────────────────────────────────────────────────────────────
//  NIVELES NUMÉRICOS (para comparaciones rápidas)
// ─────────────────────────────────────────────────────────────────────────────
export const RoleLevel = {
  User:        0,
  Contributor: 1,
  Premium:     2,
  Helper:      3,
  Moderator:   4,
  Developer:   5,
  Owner:       6,
} as const
export type RoleLevelValue = (typeof RoleLevel)[keyof typeof RoleLevel]

// ─────────────────────────────────────────────────────────────────────────────
//  UTILIDADES INTERNAS
// ─────────────────────────────────────────────────────────────────────────────

/** Normaliza cualquier JID a solo los dígitos del número. */
function toNum(jid: string): string {
  return jid
    .replace('@s.whatsapp.net', '')
    .replace('@lid', '')
    .replace('@g.us', '')
    .replace(/\D/g, '')
}

function matchesJid(jid: string, target: string): boolean {
  const n = toNum(jid)
  const t = toNum(target)
  return n === t || n.endsWith(t) || t.endsWith(n)
}

function inEntries(jid: string, entries: (string | RoleEntry | DevEntry)[]): boolean {
  return entries.some(e => {
    if (typeof e === 'string') return matchesJid(jid, e)
    const [target, , active] = e as RoleEntry
    if (Array.isArray(e) && e.length > 2 && active === false) return false
    return matchesJid(jid, String(target))
  })
}

// ─────────────────────────────────────────────────────────────────────────────
//  CHECKS DE ROL
// ─────────────────────────────────────────────────────────────────────────────

/** Owner: config.ownerJid (env) + array owners de este archivo. */
export function isOwner(jid: string): boolean {
  return config.ownerJid.some(o => matchesJid(jid, o)) || inEntries(jid, owners)
}

/** Dev: hereda Owner. */
export function isDev(jid: string): boolean {
  return isOwner(jid) || inEntries(jid, devs)
}

/** Mod: hereda Dev. */
export function isMod(jid: string): boolean {
  return isDev(jid) || inEntries(jid, mods)
}

/** Helper: hereda Mod. */
export function isHelper(jid: string): boolean {
  return isMod(jid) || inEntries(jid, helpers)
}

/** Premium activo (expirado no cuenta). Helpers+ son premium implícito. */
export function isPremium(jid: string): boolean {
  if (isHelper(jid)) return true
  const entry = prems.find(p => matchesJid(jid, p.jid))
  if (!entry) return false
  return entry.expiry === 0 || Date.now() < entry.expiry
}

/** Nivel numérico del JID. */
export function getRoleLevel(jid: string): RoleLevelValue {
  if (isOwner(jid))  return RoleLevel.Owner
  if (isDev(jid))    return RoleLevel.Developer
  if (isMod(jid))    return RoleLevel.Moderator
  if (isHelper(jid)) return RoleLevel.Helper
  if (isPremium(jid)) return RoleLevel.Premium
  if (inEntries(jid, contributors)) return RoleLevel.Contributor
  return RoleLevel.User
}

/** Etiqueta y nivel del JID. */
export function getRole(jid: string): { level: RoleLevelValue; label: string } {
  if (isOwner(jid))  return { level: RoleLevel.Owner,        label: '👑 Owner'      }
  if (isDev(jid))    return { level: RoleLevel.Developer,    label: '🔧 Dev'        }
  if (isMod(jid))    return { level: RoleLevel.Moderator,    label: '🛡️ Mod'        }
  if (isHelper(jid)) return { level: RoleLevel.Helper,       label: '🤝 Helper'     }
  if (isPremium(jid)) return { level: RoleLevel.Premium,     label: '⭐ Premium'    }
  return                      { level: RoleLevel.User,        label: '👤 Usuario'   }
}

// ─────────────────────────────────────────────────────────────────────────────
//  GESTIÓN DE PREMIUM EN RUNTIME
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Agrega o actualiza un usuario premium.
 * @param days 0 = vitalicio
 */
export function addPrem(jid: string, label = '', days = 0): PremEntry {
  const expiry = days > 0 ? Date.now() + days * 86_400_000 : 0
  const idx    = prems.findIndex(p => matchesJid(p.jid, jid))
  const entry: PremEntry = { jid, label, expiry }
  if (idx >= 0) prems[idx] = entry
  else          prems.push(entry)
  return entry
}

export function removePrem(jid: string): boolean {
  const idx = prems.findIndex(p => matchesJid(p.jid, jid))
  if (idx < 0) return false
  prems.splice(idx, 1)
  return true
}

export function getPremInfo(jid: string): PremEntry | null {
  return prems.find(p => matchesJid(p.jid, jid)) ?? null
}

/** Limpia premium expirados del array. */
export function cleanExpiredPrems(): number {
  const before = prems.length
  const now    = Date.now()
  const active = prems.filter(p => p.expiry === 0 || now < p.expiry)
  prems.length = 0
  prems.push(...active)
  return before - prems.length
}

// ─────────────────────────────────────────────────────────────────────────────
//  HELPERS DE MOD EN RUNTIME
// ─────────────────────────────────────────────────────────────────────────────

export function addMod(jid: string, label = ''): void {
  if (!inEntries(jid, mods)) mods.push([jid, label || jid, true])
}

export function removeMod(jid: string): boolean {
  const idx = mods.findIndex(([j]) => matchesJid(j, jid))
  if (idx < 0) return false
  mods.splice(idx, 1)
  return true
}

// ─────────────────────────────────────────────────────────────────────────────
//  LISTADO FORMATEADO
// ─────────────────────────────────────────────────────────────────────────────

function fmtEntries(title: string, entries: (string | RoleEntry | DevEntry)[]): string {
  if (!entries.length) return ''
  const lines = entries
    .filter(e => !Array.isArray(e) || (e as RoleEntry)[2] !== false)
    .map(e => {
      if (typeof e === 'string')    return `  ╰ ${e}`
      const [jid, label] = e as [string, string]
      return `  ╰ ${label || jid}`
    })
  return lines.length ? `*${title}*\n${lines.join('\n')}` : ''
}

export function getRoleList(): string {
  const ownerAll = [
    ...config.ownerJid.map(j => [j, j] as DevEntry),
    ...owners,
  ]
  return [
    fmtEntries('👑 Owners',         ownerAll),
    fmtEntries('🔧 Devs',           devs),
    fmtEntries('🛡️ Mods',           mods),
    fmtEntries('🤝 Helpers',        helpers.map(h => [h, h] as DevEntry)),
    fmtEntries('⭐ Premium',        prems.map(p => [p.jid, p.label || p.jid] as DevEntry)),
    fmtEntries('🔬 BetaTesters',    betaTesters.map(h => [h, h] as DevEntry)),
    fmtEntries('💎 Donators',       donators.map(h => [h, h] as DevEntry)),
    fmtEntries('🤝 Partners',       partners.map(h => [h, h] as DevEntry)),
  ].filter(Boolean).join('\n\n')
}
