// server.ts — panel web de WinsiBot. Reemplaza al panel PHP.
//
// Un solo servidor (Hono + ws) para API REST, WebSocket, y el build
// estático de web/ — mismo origen para todo, sin CORS. Node ya tiene en
// memoria el estado más "vivo" del bot (sub-bots, comandos ejecutándose en
// tiempo real), así que tiene sentido que sea el dueño de este servidor en
// vez de Python o Rust.

import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import type { WASocket } from '@whiskeysockets/baileys'
import { logger } from '@core/logger.js'
import { authRoutes, meHandler } from './routes/auth.js'
import { subbotsRoutes } from './routes/subbots.js'
import { groupsRoutes } from './routes/groups.js'
import { adminRoutes } from './routes/admin.js'
import { requireAuth, requireOwner } from './middleware.js'
import { attachWebSocket, broadcast } from './ws.js'
import { setMainSock } from './mainSock.js'

const PORT      = Number(process.env.DASHBOARD_PORT ?? 4002)
const WEB_DIST  = join(process.cwd(), 'web', 'dist')

const app = new Hono()

app.get('/api/health', (c) => c.json({ ok: true, service: 'winsibot-dashboard' }))

app.route('/api/auth', authRoutes)
app.get('/api/me', requireAuth, meHandler())
app.use('/api/subbots/*', requireAuth)
app.route('/api/subbots', subbotsRoutes)
app.use('/api/groups/*', requireAuth)
app.route('/api/groups', groupsRoutes)
app.use('/api/admin/*', requireAuth, requireOwner)
app.route('/api/admin', adminRoutes)

// ─── Estático (build de web/) + fallback a index.html para las rutas de
// TanStack Router (client-side routing) ───────────────────────────────────
if (existsSync(WEB_DIST)) {
  app.use('/*', serveStatic({ root: './web/dist' }))
  app.get('*', (c) => {
    const html = readFileSync(join(WEB_DIST, 'index.html'), 'utf-8')
    return c.html(html)
  })
} else {
  app.get('*', (c) => c.text(
    'Panel web no compilado — corré "cd web && npm run build" y reiniciá el bot.',
    503,
  ))
}

let started = false

export function startDashboard(sock: WASocket): void {
  setMainSock(sock)
  if (started) return
  started = true

  const server = serve({ fetch: app.fetch, port: PORT }, () => {
    logger.info(`[dashboard] panel web en http://localhost:${PORT}`)
  })

  attachWebSocket(server as unknown as import('node:http').Server)

  // Empuja un "algo cambió, refrescá stats" cada 15s — mucho más barato que
  // mandar los números en sí (evita duplicar la forma de /api/admin/stats
  // acá); el cliente hace un solo GET liviano al recibirlo.
  setInterval(() => broadcast('stats_tick', {}), 15_000).unref()
}
