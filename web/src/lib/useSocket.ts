// useSocket.ts — conexión WS única compartida por todo el dashboard.
// Reconecta con backoff si se cae; cada mensaje es { type, payload } y los
// componentes se suscriben por tipo (invalidando la query de TanStack que
// corresponda en vez de mantener su propio estado en paralelo).
import { useEffect, useRef } from 'react'

export interface SocketMessage {
  type:    string
  payload: unknown
}

type Listener = (msg: SocketMessage) => void

class DashboardSocket {
  private ws:        WebSocket | null = null
  private listeners  = new Set<Listener>()
  private retryDelay = 1_000
  private closedByUs = false

  connect(): void {
    if (this.ws) return
    this.closedByUs = false

    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:'
    this.ws = new WebSocket(`${proto}//${location.host}/ws`)

    this.ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data) as SocketMessage
        for (const l of this.listeners) l(msg)
      } catch {}
    }

    this.ws.onclose = () => {
      this.ws = null
      if (this.closedByUs) return
      setTimeout(() => this.connect(), this.retryDelay)
      this.retryDelay = Math.min(this.retryDelay * 1.5, 15_000)
    }

    this.ws.onopen = () => {
      this.retryDelay = 1_000
    }
  }

  disconnect(): void {
    this.closedByUs = true
    this.ws?.close()
    this.ws = null
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }
}

export const dashboardSocket = new DashboardSocket()

/** Se suscribe a mensajes del WS mientras el componente está montado. */
export function useSocketListener(fn: Listener): void {
  const fnRef = useRef(fn)
  fnRef.current = fn

  useEffect(() => {
    dashboardSocket.connect()
    return dashboardSocket.subscribe((msg) => fnRef.current(msg))
  }, [])
}
