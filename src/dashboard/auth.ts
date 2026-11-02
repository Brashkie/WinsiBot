// auth.ts — login del dashboard vinculando con WhatsApp.
//
// Flujo: el usuario pide un código (startLogin), lo manda por WhatsApp con
// #login <código> (confirmLogin, llamado desde el comando), y la web lo
// detecta con un poll corto a /api/auth/status/:code (checkConfirmed) que
// setea la cookie de sesión apenas lo ve confirmado.
//
// Mismo patrón que src/core/events/captcha.ts (Map de pendientes +
// expiración por setTimeout) — mismo tipo de problema, misma solución.

import { randomBytes, randomInt } from 'node:crypto'
import { kv } from '@lib/kv.js'
import { config } from '@config'
import { esDueno } from '@lib/owner.js'

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
  /** El secreto del navegador que pidió el código (cookie httpOnly). */
  nonce:     string
}

const pendingByPhone = new Map<string, PendingLogin>()
const pendingByCode  = new Map<string, string>()   // code -> phone
// code -> token y el secreto del navegador que lo pidió. Hasta la 9.2 el poll
// entregaba el token a quien preguntara por el código: con conocerlo o
// adivinarlo en el minuto después del #login, la sesión era de otro.
const confirmedCodes = new Map<string, { token: string; nonce: string }>()

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // sin 0/O/1/I — se confunden al leer

function randomCode(): string {
  // randomInt y no Math.random: con suficientes salidas de Math.random se
  // puede calcular la siguiente.
  const part = () => Array.from({ length: 3 }, () => CODE_CHARS[randomInt(CODE_CHARS.length)]).join('')
  return `${part()}-${part()}`
}

/**
 * Genera un código nuevo para `phone` — invalida cualquier código pendiente
 * anterior de ese número. `nonce` es el secreto que se le deja al navegador
 * en una cookie: solo ese navegador recibe después la sesión.
 */
export function startLogin(phone: string): { code: string; nonce: string } {
  const prev = pendingByPhone.get(phone)
  if (prev) pendingByCode.delete(prev.code)

  const code = randomCode()
  const nonce = randomBytes(32).toString('hex')
  pendingByPhone.set(phone, { code, createdAt: Date.now(), nonce })
  pendingByCode.set(code, phone)

  setTimeout(() => {
    const p = pendingByPhone.get(phone)
    if (p?.code === code) {
      pendingByPhone.delete(phone)
      pendingByCode.delete(code)
    }
  }, CODE_TTL_MS).unref()

  return { code, nonce }
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

  const nonce = pendingByPhone.get(phone)?.nonce
  if (!nonce) return false
  pendingByCode.delete(normalized)
  pendingByPhone.delete(phone)

  const token = randomBytes(32).toString('hex')
  // Como el bot (lib/owner.ts): `ownerJid.includes(jid)` no reconocía a un
  // dueño configurado con su número suelto.
  const role: Role = esDueno(jid, `${senderPhone}@s.whatsapp.net`, config.ownerJid) ? 'owner' : 'user'
  const session: Session = { jid, role, createdAt: Date.now() }
  kv.set(`web_session:${token}`, session, { ttl: SESSION_TTL_MS })

  confirmedCodes.set(normalized, { token, nonce })
  setTimeout(() => confirmedCodes.delete(normalized), CONFIRM_TTL_MS).unref()

  return true
}

/** Poll desde la web — null si todavía no se confirmó, o si lo pide otro navegador. */
export function checkConfirmed(code: string, nonce: string | undefined): string | null {
  const c = confirmedCodes.get(code.trim().toUpperCase())
  if (!c || !nonce || nonce !== c.nonce) return null
  return c.token
}

// La expiración la hace el TTL del store (y su sweep de fondo) — ya no hace
// falta comparar createdAt a mano ni borrar la sesión vencida al leerla.
export function getSession(token: string | undefined): Session | null {
  if (!token) return null
  return kv.get<Session>(`web_session:${token}`)
}

export function destroySession(token: string): void {
  kv.del(`web_session:${token}`)
}
