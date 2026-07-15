/**
 * Session client — interfaz TypeScript para winsibot-session-api (Rust)
 * Guarda las creds de Baileys con escritura atómica, snapshots y recuperación.
 * Si el servidor Rust no está corriendo, todas las llamadas fallan silenciosamente.
 */

import { logger } from '@core/logger.js'

const API_URL = process.env.SESSION_API_URL ?? 'http://127.0.0.1:3001'
const API_KEY  = process.env.SESSION_API_KEY ?? ''

const _headers = {
  'Content-Type': 'application/json',
  'x-api-key':    API_KEY,
}

// ─── Fetch helper ─────────────────────────────────────────────────────────────
// Timeout hardcoded de 3s — Rust debe responder sub-ms, 3s es el worst-case.
// Sin timeout, un Rust colgado (no offline) acumula promesas pendientes para
// siempre y eventualmente agota la memoria del proceso Node.
const FETCH_TIMEOUT_MS = 3_000

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS)
  try {
    const res  = await fetch(`${API_URL}${path}`, {
      ...init,
      signal:  ctrl.signal,
      headers: { ..._headers, ...init?.headers },
    })
    const json = (await res.json()) as T & { ok: boolean; error?: string }
    if (!res.ok || !json.ok) throw new Error(json.error ?? `HTTP ${res.status}`)
    return json
  } finally {
    clearTimeout(timer)
  }
}

// ─── Tipos ────────────────────────────────────────────────────────────────────
export interface SnapMeta {
  path:      string
  sizeBytes: number
  ts:        string
}

export interface HealthResult {
  ok:                 boolean
  sessionId:          string
  healthy:            boolean
  corruptionDetected: boolean
  lastSnapshot:       SnapMeta | null
  ts:                 string
}

export interface ClearSignalResult {
  ok:      boolean
  deleted: number
  files:   string[]
  errors:  string[]
}

export interface TrackItem {
  id:        string
  jid:       string
  msg_type?: string
  ts:        number
}

export interface AckItem {
  id:     string
  status: number  // 0=enviado, 1=entregado, 2=leido, 3=reproducido, -1=fallido
}

export interface PendingMsg {
  id:          string
  jid:         string
  msg_type:    string
  sent_at:     number
  elapsed_sec: number
  is_group:    boolean
}

export interface DeliveryStats {
  total:        number
  sent:         number
  delivered:    number
  read:         number
  failed:       number
  delivery_pct: string
  read_pct:     string
}

// ─── Cliente de sesión ────────────────────────────────────────────────────────
export class SessionClient {
  // Debounce state para save() — evita saturar Rust con una escritura por mensaje
  private _pendingCreds:  unknown | null = null
  private _debounceTimer: ReturnType<typeof setTimeout> | null = null
  private readonly _debounceMs = 5_000   // máximo 1 escritura cada 5s

  constructor(private readonly sessionId: string) {}

  /**
   * Encola las creds para escritura diferida.
   * Si ya hay un timer corriendo, simplemente actualiza el valor pendiente.
   * Llama flushNow() antes de salir para asegurar la última escritura.
   */
  async save(creds: unknown): Promise<void> {
    this._pendingCreds = creds
    if (this._debounceTimer) return   // timer ya activo — solo actualizar valor

    this._debounceTimer = setTimeout(async () => {
      this._debounceTimer = null
      await this._flush()
    }, this._debounceMs)
  }

  /** Fuerza escritura inmediata (usar en graceful shutdown). */
  async flushNow(): Promise<void> {
    if (this._debounceTimer) {
      clearTimeout(this._debounceTimer)
      this._debounceTimer = null
    }
    await this._flush()
  }

  private async _flush(): Promise<void> {
    if (!this._pendingCreds) return
    const creds = this._pendingCreds
    this._pendingCreds = null
    try {
      const data = Buffer.from(JSON.stringify(creds)).toString('base64')
      await apiFetch('/write', {
        method: 'POST',
        body:   JSON.stringify({ sessionId: this.sessionId, data }),
      })
    } catch (err) {
      logger.warn({ err }, `[session:${this.sessionId}] fallo al respaldar sesión en Rust`)
    }
  }

  async load(): Promise<unknown> {
    const res = await apiFetch<{ data: string }>(`/read?sessionId=${this.sessionId}`)
    return JSON.parse(Buffer.from(res.data, 'base64').toString('utf8'))
  }

  /**
   * Lee el mejor backup disponible de creds sin restaurar ni sobreescribir nada.
   * Prueba: archivo actual → snapshot #1..10.
   * Devuelve el objeto de creds parseado, o null si no hay ninguno válido.
   * Usado por authVerifier para recuperar creds.json sin necesitar QR.
   */
  async readBackup(): Promise<{ creds: unknown; source: string; index: number } | null> {
    try {
      const res = await apiFetch<{ data: string; source: string; index: number }>(
        `/sessions/backup?sessionId=${this.sessionId}`
      )
      const creds = JSON.parse(Buffer.from(res.data, 'base64').toString('utf8'))
      return { creds, source: res.source, index: res.index }
    } catch {
      return null
    }
  }

  async health(): Promise<HealthResult> {
    return apiFetch<HealthResult>(`/healthy?sessionId=${this.sessionId}`)
  }

  async isHealthy(): Promise<boolean> {
    try {
      const h = await this.health()
      return h.healthy
    } catch {
      return false
    }
  }

  async recover(): Promise<string | null> {
    try {
      const res = await apiFetch<{ message: string }>('/recover', {
        method: 'POST',
        body:   JSON.stringify({ sessionId: this.sessionId }),
      })
      return res.message
    } catch {
      return null
    }
  }

  async snapshots(): Promise<string[]> {
    const res = await apiFetch<{ snapshots: string[] }>(`/snapshots?sessionId=${this.sessionId}`)
    return res.snapshots
  }

  /**
   * Elimina session-*.json y sender-key-*.json del directorio auth de Baileys.
   * Usar cuando se detecta Bad MAC flood para forzar re-keying del protocolo Signal.
   */
  async clearSignalSessions(): Promise<ClearSignalResult> {
    return apiFetch<ClearSignalResult>('/sessions/signal/clear', {
      method: 'POST',
      body:   '{}',
    })
  }

  /**
   * Reporta un Bad MAC para un grupo específico.
   * Devuelve shouldClear=true cuando ese grupo alcanzó su umbral propio
   * (5 en 30s) O cuando el contador GLOBAL de Rust (agregado de todos los
   * grupos — 8 en 60s) se disparó, aunque este grupo en particular no haya
   * llegado al suyo. `scope` distingue cuál de los dos fue.
   * Falla silenciosamente si Rust no está corriendo.
   */
  async reportBadMac(jid: string): Promise<{ count: number; shouldClear: boolean; scope: 'group' | 'global' }> {
    try {
      const res = await apiFetch<{ count: number; shouldClear: boolean; scope?: string }>('/badmac/report', {
        method: 'POST',
        body:   JSON.stringify({ jid }),
      })
      return {
        count:      res.count,
        shouldClear: res.shouldClear,
        scope:      res.scope === 'global' ? 'global' : 'group',
      }
    } catch {
      return { count: 0, shouldClear: false, scope: 'group' }
    }
  }

  /**
   * Resetea el contador Bad MAC de un grupo (después de hacer clear manual).
   */
  async resetBadMac(jid: string): Promise<void> {
    try {
      await apiFetch('/badmac/reset', {
        method: 'POST',
        body:   JSON.stringify({ jid }),
      })
    } catch { /* silencioso */ }
  }

  /**
   * Verifica si un sender puede enviar mensajes (rate limiting).
   * Límite: 15 mensajes / 10s por sender.
   * Falla abierto: si Rust no responde, siempre permite.
   */
  async checkRate(sender: string): Promise<{ allowed: boolean; remaining: number }> {
    try {
      const res = await apiFetch<{ allowed: boolean; remaining: number }>('/rate/check', {
        method: 'POST',
        body:   JSON.stringify({ sender }),
      })
      return { allowed: res.allowed, remaining: res.remaining }
    } catch {
      return { allowed: true, remaining: 15 }
    }
  }

  // ─── Message delivery tracking ───────────────────────────────────────────────

  /**
   * Registrar mensajes salientes en el SQLite de Rust.
   * Llamar después de enviar, pasando el messageId devuelto por Baileys.
   */
  async trackMessages(items: TrackItem[]): Promise<void> {
    if (!items.length) return
    await apiFetch('/messages/track', {
      method: 'POST',
      body:   JSON.stringify({ messages: items }),
    })
  }

  /**
   * Actualizar estado de entrega en lote.
   * Llamar desde el listener messages.update / message-receipt.update de Baileys.
   */
  async ackMessages(updates: AckItem[]): Promise<void> {
    if (!updates.length) return
    await apiFetch('/messages/ack', {
      method: 'POST',
      body:   JSON.stringify({ updates }),
    })
  }

  /** Mensajes enviados hace >N minutos sin confirmación de entrega. */
  async getPendingMessages(minutes = 5, limit = 100): Promise<PendingMsg[]> {
    const res = await apiFetch<{ pending: PendingMsg[] }>(
      `/messages/pending?minutes=${minutes}&limit=${limit}`
    )
    return res.pending
  }

  /** Estadísticas de delivery de las últimas N horas. */
  async getDeliveryStats(hours = 24): Promise<DeliveryStats> {
    return apiFetch<DeliveryStats>(`/messages/stats?hours=${hours}`)
  }

  /** Limpiar registros más viejos de N días. */
  async cleanupMessages(days = 7): Promise<void> {
    await apiFetch(`/messages/cleanup?days=${days}`, { method: 'DELETE' })
  }

  /**
   * Llama esto al arrancar el bot.
   * Si la sesión está corrupta o hay error, intenta recuperar desde snapshot.
   */
  async ensureHealthy(): Promise<void> {
    let h: HealthResult | null
    try {
      h = await this.health()
    } catch {
      return // Rust no está corriendo — omitir silenciosamente
    }

    if (!h.healthy || h.corruptionDetected) {
      logger.warn(`[session:${this.sessionId}] corrupción detectada — recuperando...`)
      const msg = await this.recover()
      if (msg) {
        logger.info(`[session:${this.sessionId}] ${msg}`)
      } else {
        logger.warn(`[session:${this.sessionId}] sin snapshots — se generará QR nuevo`)
      }
    }
  }
}

// ─── Helpers globales ─────────────────────────────────────────────────────────
export async function listActiveSessions(): Promise<string[]> {
  const res = await apiFetch<{ sessions: string[] }>('/sessions')
  return res.sessions
}

export async function ping(): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/health/live`)
    return res.ok
  } catch {
    return false
  }
}

export const sessionClient = new SessionClient('main')
