import { Hono } from 'hono'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import { z } from 'zod'
import { startLogin, checkConfirmed, getSession, destroySession } from '../auth.js'
import { subBots } from '@plugins/commands/jadibot/serbot.js'
import { getAdminGroups } from '../groupsInfo.js'
import type { MeResponse, SubBotSummary } from '../types.js'

export const SESSION_COOKIE = 'winsi_session'

const startSchema = z.object({ phone: z.string().min(5).max(20) })

export const authRoutes = new Hono()

authRoutes.post('/start', async (c) => {
  const body = await c.req.json().catch(() => null)
  const parsed = startSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: 'Número inválido' }, 400)

  const phone = parsed.data.phone.replace(/\D/g, '')
  const code  = startLogin(phone)
  return c.json({ code })
})

authRoutes.get('/status/:code', (c) => {
  const code  = c.req.param('code')
  const token = checkConfirmed(code)
  if (!token) return c.json({ confirmed: false })

  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'Lax',
    secure:   process.env.NODE_ENV === 'production',
    path:     '/',
    maxAge:   30 * 24 * 60 * 60,
  })
  return c.json({ confirmed: true })
})

authRoutes.post('/logout', (c) => {
  const token = getCookie(c, SESSION_COOKIE)
  if (token) destroySession(token)
  deleteCookie(c, SESSION_COOKIE, { path: '/' })
  return c.json({ ok: true })
})

// GET /api/me — montado aparte en server.ts (no vive bajo /auth).
export function meHandler() {
  return async (c: import('hono').Context) => {
    const token   = getCookie(c, SESSION_COOKIE)
    const session = getSession(token)
    if (!session) return c.json({ error: 'No autenticado' }, 401)

    const myPhone = session.jid.split('@')[0]?.split(':')[0] ?? ''
    const subbots: SubBotSummary[] = [...subBots.values()]
      .filter(b => b.ownerJid === session.jid || b.phone === myPhone)
      .map(b => ({
        phone:                 b.phone,
        name:                  b.name,
        status:                b.status,
        connectedAt:           b.connectedAt,
        msgCount:              b.msgCount,
        lastMessageAt:         b.lastMessageAt,
        ...(b.lastDisconnectReason ? { lastDisconnectReason: b.lastDisconnectReason } : {}),
        ...(b.lastDisconnectAt    ? { lastDisconnectAt: b.lastDisconnectAt }       : {}),
      }))

    const adminGroups = session.role === 'owner'
      ? await getAdminGroups(null)
      : await getAdminGroups(session.jid)

    const res: MeResponse = { jid: session.jid, role: session.role, subbots, adminGroups }
    return c.json(res)
  }
}
