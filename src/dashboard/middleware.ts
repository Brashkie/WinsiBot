import type { Context, Next } from 'hono'
import { getCookie } from 'hono/cookie'
import { getSession, type Session } from './auth.js'
import { SESSION_COOKIE } from './routes/auth.js'

// Hono no tiene un slot tipado nativo para esto — se guarda en c.set()/get()
// bajo esta key, casteado en cada handler que lo necesita.
export const SESSION_KEY = 'session'

export async function requireAuth(c: Context, next: Next) {
  const token   = getCookie(c, SESSION_COOKIE)
  const session = getSession(token)
  if (!session) return c.json({ error: 'No autenticado' }, 401)
  c.set(SESSION_KEY, session)
  await next()
}

export async function requireOwner(c: Context, next: Next) {
  const session = c.get(SESSION_KEY) as Session
  if (session.role !== 'owner') return c.json({ error: 'Solo el owner puede acceder' }, 403)
  await next()
}

export function getSessionFrom(c: Context): Session {
  return c.get(SESSION_KEY) as Session
}
