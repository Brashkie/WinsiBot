// ─────────────────────────────────────────────────────────────────────────────
//  WinsiBot — CIRCUIT BREAKER
//
//  Cuando una dependencia externa se cae, seguir llamándola cuesta caro: cada
//  intento paga su timeout completo antes de fallar. En este bot eso pega en el
//  camino crítico — el middleware de rate limit llama a Python en CADA comando
//  y el handler llama a Rust en CADA mensaje. Con Python caída, todos los
//  comandos esperan el timeout (más el reintento de axios-retry) para acabar
//  fallando igual, y mientras tanto ocupan un slot del semáforo de handler.ts.
//
//  El corte evita exactamente eso: tras N fallos seguidos el circuito se abre y
//  las llamadas fallan al instante, sin red de por medio. Pasado `openMs` deja
//  pasar UNA de prueba (half-open); si responde, vuelve a cerrarse.
//
//      CLOSED ──(N fallos)──► OPEN ──(openMs)──► HALF_OPEN
//         ▲                                          │
//         └──────────────(1 éxito)───────────────────┘
//                                │
//                          (1 fallo) ──► OPEN
//
//  Qué cuenta como fallo lo decide quien llama, y es importante que no cuente
//  de más: un 4xx suele significar "la petición estaba mal", no "el servicio
//  está caído". El caso concreto acá es /rate/check de Rust, que devuelve 429
//  A PROPÓSITO cuando bloquea a alguien (ver el comentario de allowNon2xx en
//  lib/session.ts) — contarlo como fallo abriría el circuito justo cuando el
//  rate limiter está funcionando bien.
// ─────────────────────────────────────────────────────────────────────────────

import { logger } from '@core/logger.js'

export type CircuitState = 'closed' | 'open' | 'half-open'

export interface CircuitOptions {
  /** Fallos seguidos antes de abrir. Default 5. */
  failureThreshold?: number
  /** Cuánto queda abierto antes de probar de nuevo (ms). Default 30s. */
  openMs?:           number
}

export class CircuitBreaker {
  private failures   = 0
  private state:     CircuitState = 'closed'
  private openedAt   = 0
  private _rejected  = 0
  private _trips     = 0

  private readonly failureThreshold: number
  private readonly openMs:           number

  constructor(private readonly name: string, opts: CircuitOptions = {}) {
    this.failureThreshold = opts.failureThreshold ?? 5
    this.openMs           = opts.openMs           ?? 30_000
  }

  /**
   * ¿Se puede intentar la llamada? Si devuelve false, hay que fallar de
   * inmediato con el fallback, sin tocar la red.
   */
  canAttempt(): boolean {
    if (this.state === 'closed') return true

    if (this.state === 'open') {
      if (Date.now() - this.openedAt < this.openMs) {
        this._rejected++
        return false
      }
      // Se cumplió el tiempo: dejar pasar una de prueba.
      this.state = 'half-open'
      logger.info(`Circuito [${this.name}] → half-open (probando una llamada)`)
      return true
    }

    // half-open: ya hay una prueba en curso, el resto sigue rechazándose para
    // no mandar una avalancha contra un servicio que quizá siga caído.
    this._rejected++
    return false
  }

  recordSuccess(): void {
    if (this.state === 'half-open') {
      logger.info(`Circuito [${this.name}] → cerrado (el servicio respondió)`)
    }
    this.state    = 'closed'
    this.failures = 0
  }

  recordFailure(): void {
    this.failures++

    if (this.state === 'half-open') {
      // La prueba falló: volver a abrir sin contar de nuevo hasta el umbral.
      this.trip()
      return
    }
    if (this.state === 'closed' && this.failures >= this.failureThreshold) {
      this.trip()
    }
  }

  private trip(): void {
    this.state    = 'open'
    this.openedAt = Date.now()
    this._trips++
    logger.warn(
      `Circuito [${this.name}] → ABIERTO tras ${this.failures} fallos — ` +
      `se deja de llamar por ${this.openMs / 1000}s`,
    )
  }

  get currentState(): CircuitState { return this.state }

  stats(): { name: string; state: CircuitState; failures: number; rejected: number; trips: number } {
    return {
      name:     this.name,
      state:    this.state,
      failures: this.failures,
      rejected: this._rejected,
      trips:    this._trips,
    }
  }
}

// ─── Circuitos del proyecto ──────────────────────────────────────────────────
// Uno por dependencia: que Python esté caída no debe cortar las llamadas a
// Rust ni al revés.

// Python está en el camino de cada comando (spam/check) — abrir rápido.
export const pythonCircuit = new CircuitBreaker('python', { failureThreshold: 5, openMs: 30_000 })

// Rust está en el camino de cada mensaje (rate/check) y es más crítico para la
// sesión, así que se le da algo más de margen antes de cortar.
export const rustCircuit = new CircuitBreaker('rust', { failureThreshold: 8, openMs: 20_000 })

const registry = [pythonCircuit, rustCircuit]

export function circuitStats() {
  return registry.map(c => c.stats())
}
