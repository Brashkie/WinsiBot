// auth.ts — login del dashboard vinculando con WhatsApp.
//
// Flujo: el usuario pide un código (startLogin), lo manda por WhatsApp con
// #login <código> (confirmLogin, llamado desde el comando), y la web lo
// detecta con un poll corto a /api/auth/status/:code (checkConfirmed) que
// setea la cookie de sesión apenas lo ve confirmado.
//
// Mismo patrón que src/core/events/captcha.ts (Map de pendientes +
// expiración por setTimeout) — mismo tipo de problema, misma solución.

import { randomBytes } from 'crypto'
import { db } from '@lib/db.js'
import { config } from '@config'

const CODE_TTL_MS    = 5 * 60_000
const CONFIRM_TTL_MS = 60_000
const SESSION_TTL_MS = 30 * 24 * 60 * 60_000 // 30 días

export type Role = 'owner' | 'user'

export interface Session {
  jid:       string
  role:      Role
  createdAt: number
}

interface PendingLogin {
  code:      string
  createdAt: number
}

const pendingByPhone = new Map<string, PendingLogin>()
const pendingByCode  = new Map<string, string>()   // code -> phone
const confirmedCodes = new Map<string, string>()   // code -> token (para el poll)

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // sin 0/O/1/I — se confunden al leer

function randomCode(): string {
  const part = () => Array.from({ length: 3 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('')
  return `${part()}-${part()}`
}

/** Genera un código nuevo para `phone` — invalida cualquier código pendiente anterior de ese número. */
export function startLogin(phone: string): string {
  const prev = pendingByPhone.get(phone)
  if (prev) pendingByCode.delete(prev.code)

  const code = randomCode()
  pendingByPhone.set(phone, { code, createdAt: Date.now() })
  pendingByCode.set(code, phone)

  setTimeout(() => {
    const p = pendingByPhone.get(phone)
    if (p?.code === code) {
      pendingByPhone.delete(phone)
      pendingByCode.delete(code)
    }
  }, CODE_TTL_MS).unref()

  return code
}

/**
 * Confirma un código pendiente contra un JID real — llamado desde el
 * comando #login. `phone` es el número que escribió `#login <code>`; se
 * exige que coincida con el número que pidió el código en la web (evita
 * que cualquiera confirme un código ajeno adivinándolo con su propio
 * WhatsApp).
 */
export function confirmLogin(code: string, jid: string, senderPhone: string): boolean {
  const normalized = code.trim().toUpperCase()
  const phone = pendingByCode.get(normalized)
  if (!phone || phone !== senderPhone) return false

  pendingByCode.delete(normalized)
  pendingByPhone.delete(phone)

  const token = randomBytes(32).toString('hex')
  const role: Role = config.ownerJid.includes(jid) ? 'owner' : 'user'
  const session: Session = { jid, role, createdAt: Date.now() }
  db.kvSet(`web_session:${token}`, session)

  confirmedCodes.set(normalized, token)
  setTimeout(() => confirmedCodes.delete(normalized), CONFIRM_TTL_MS).unref()

  return true
}

/** Poll desde la web — null si todavía no se confirmó. */
export function checkConfirmed(code: string): string | null {
  return confirmedCodes.get(code.trim().toUpperCase()) ?? null
}

export function getSession(token: string | undefined): Session | null {
  if (!token) return null
  const session = db.kvGet<Session>(`web_session:${token}`)
  if (!session) return null
  if (Date.now() - session.createdAt > SESSION_TTL_MS) {
    db.kvDelete(`web_session:${token}`)
    return null
  }
  return session
}

export function destroySession(token: string): void {
  db.kvDelete(`web_session:${token}`)
}
