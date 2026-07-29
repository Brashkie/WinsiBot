// ws.ts — hub de WebSocket del dashboard, compartido por todas las
// conexiones. Se cuelga del mismo servidor HTTP que Hono (mismo puerto,
// mismo origen — sin CORS). La cookie de sesión viaja sola en el handshake
// de upgrade (es un request HTTP normal), así que se valida ahí mismo antes
// de aceptar la conexión.

import { WebSocketServer, type WebSocket } from 'ws'
import type { Server } from 'node:http'
import { getSession } from './auth.js'
import { SESSION_COOKIE } from './routes/auth.js'

function parseCookies(header: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const part of header.split(';')) {
    const idx = part.indexOf('=')
    if (idx === -1) continue
    const key = part.slice(0, idx).trim()
    const val = part.slice(idx + 1).trim()
    if (key) out[key] = decodeURIComponent(val)
  }
  return out
}

const clients = new Set<WebSocket>()

export function attachWebSocket(server: Server): void {
  const wss = new WebSocketServer({ noServer: true })

  server.on('upgrade', (req, socket, head) => {
    if (!req.url?.startsWith('/ws')) {
      socket.destroy()
      return
    }

    const cookies = parseCookies(req.headers.cookie ?? '')
    const session = getSession(cookies[SESSION_COOKIE])
    if (!session) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
      socket.destroy()
      return
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      clients.add(ws)
      ws.on('close', () => clients.delete(ws))
    })
  })
}

export function broadcast(type: string, payload: unknown): void {
  if (clients.size === 0) return
  const msg = JSON.stringify({ type, payload })
  for (const ws of clients) {
    if (ws.readyState === ws.OPEN) ws.send(msg)
  }
}
