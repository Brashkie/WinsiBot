// ─────────────────────────────────────────────────────────────────────────────
//  WinsiBot — LOAD SHEDDING
//
//  Distinto del rate limit: el rate limit protege de un usuario que abusa, esto
//  protege al bot de sí mismo cuando ya no da abasto. Cuando la carga supera
//  ciertos límites, en vez de intentar procesar todo hasta morir, se sacrifica
//  lo prescindible y se mantiene lo que no puede fallar.
//
//      NORMAL     todo pasa
//      DEGRADADO  cae lo opcional (IA, descargas, música, NSFW)
//      CRÍTICO    cae también el juego (RPG, fun, roleplay, stickers)
//
//  Nunca se descarta moderación, administración ni comandos de owner: si el bot
//  está saturado por un flood, apagar el antispam es exactamente lo contrario
//  de lo que hay que hacer.
//
//  Las dos señales:
//
//   1. Lag del event loop, medido con monitorEventLoopDelay() de perf_hooks.
//      Es la única señal que detecta de verdad la saturación de Node: el
//      proceso puede estar al 2% de CPU y con memoria normal mientras el event
//      loop está bloqueado. Ni Rust ni el supervisor pueden verlo desde fuera
//      hasta que ya dejó de responder.
//   2. Ocupación del semáforo de handler.ts, que dice cuántos mensajes se
//      están procesando a la vez y cuántos esperan cupo.
//
//  Los descartes NO responden nada al usuario, a propósito: si el bot está
//  saturado, generar más mensajes salientes empeora las dos cosas que
//  importan — la carga y el riesgo de que WhatsApp lea el patrón como abuso.
//  Queda registrado en el log, que es donde sirve.
// ─────────────────────────────────────────────────────────────────────────────

import { monitorEventLoopDelay } from 'perf_hooks'
import { logger } from './logger.js'

export type LoadLevel = 'normal' | 'degraded' | 'critical'

/** Prioridad de un comando. Cuanto más alta, más tarde se sacrifica. */
export type Priority = 'critical' | 'high' | 'normal' | 'low'

// Categorías → prioridad. Las que no figuran caen en 'normal'.
const PRIORITY_BY_CATEGORY: Record<string, Priority> = {
  // Nunca se descartan: moderar y administrar es lo que hay que poder hacer
  // JUSTO cuando el bot está bajo presión.
  owner:      'critical',
  admin:      'critical',
  jadibot:    'high',
  general:    'high',
  util:       'high',
  info:       'high',
  // El juego: molesto perderlo, pero nadie se queda sin moderación por esto.
  rpg:        'normal',
  fun:        'normal',
  roleplay:   'normal',
  sticker:    'normal',
  // Lo caro y prescindible: IA (llamadas a APIs externas), descargas y medios.
  ai:         'low',
  downloader: 'low',
  music:      'low',
  media:      'low',
  scraper:    'low',
  nsfw:       'low',
}

export function priorityOf(category: string | undefined): Priority {
  return PRIORITY_BY_CATEGORY[category ?? ''] ?? 'normal'
}

// ─── Medición del lag ────────────────────────────────────────────────────────
// resolution 20ms: suficiente para distinguir "va bien" de "está atascado" sin
// que el propio muestreo cueste nada apreciable.
const histogram = monitorEventLoopDelay({ resolution: 20 })
histogram.enable()

// Umbrales en ms sobre el MÁXIMO lag de la ventana, no sobre un percentil.
// Con una ventana de 2s y resolución de 20ms hay ~100 muestras, así que un
// bloqueo aislado —justo lo que hay que detectar— queda por debajo del
// percentil 99 y pasa desapercibido: medido, un bloqueo real de 1.3s daba un
// p99 de 40ms. El máximo sí lo ve. A cambio es más sensible, así que los
// umbrales van más altos que los que tendría un percentil.
const DEGRADED_LAG_MS = 400
const CRITICAL_LAG_MS = 1_500

// La ventana se resetea en cada lectura para que el nivel refleje el estado
// ACTUAL. Sin esto, un pico al arrancar dejaría el bot en modo degradado
// durante horas, porque el histograma acumula desde que se habilitó.
let _lastLagMax = 0

function lagMax(): number {
  const max = histogram.max / 1e6   // ns → ms
  histogram.reset()
  _lastLagMax = max
  return max
}

// ─── Estado ──────────────────────────────────────────────────────────────────
let _level: LoadLevel = 'normal'
let _shed = { low: 0, normal: 0 }
let _lagAtChange = 0

interface SemaphoreSnapshot {
  active:  number
  max:     number
  waiting: number
}

let _semaphore: () => SemaphoreSnapshot = () => ({ active: 0, max: 1, waiting: 0 })

/** handler.ts inyecta acá el estado de su semáforo (evita un ciclo de imports). */
export function registerSemaphore(fn: () => SemaphoreSnapshot): void {
  _semaphore = fn
}

// Re-evaluar cada 2s: bastante rápido para reaccionar a una ráfaga, bastante
// lento para no oscilar entre niveles con cada mensaje.
const EVAL_MS = 2_000

// Subir de nivel es inmediato; bajar espera. Sin esto el shedding casi no
// llegaría a aplicarse: mientras el event loop está bloqueado NO corre nada
// —tampoco este evaluador— así que el pico solo se ve en la evaluación
// siguiente, y sin histéresis la de después ya lo habría bajado a normal. El
// resultado sería un bot que detecta la saturación justo cuando ya pasó.
const MIN_LEVEL_MS = 10_000
let _levelSince = 0

setInterval(() => {
  const lag = lagMax()
  const s   = _semaphore()
  const occupancy = s.max > 0 ? s.active / s.max : 0

  let next: LoadLevel = 'normal'
  if (lag >= CRITICAL_LAG_MS || (occupancy >= 1 && s.waiting > 0)) {
    next = 'critical'
  } else if (lag >= DEGRADED_LAG_MS || occupancy >= 0.8) {
    next = 'degraded'
  }

  const severity = { normal: 0, degraded: 1, critical: 2 }
  const bajando  = severity[next] < severity[_level]
  if (bajando && Date.now() - _levelSince < MIN_LEVEL_MS) return

  if (next !== _level) {
    const detail = `lag max ${lag.toFixed(0)}ms · semáforo ${s.active}/${s.max} · esperando ${s.waiting}`
    if (next === 'normal') logger.info(`Carga: vuelve a NORMAL (${detail})`)
    else                   logger.warn(`Carga: ${next.toUpperCase()} (${detail})`)
    _level       = next
    _levelSince  = Date.now()
    // El lag que MOTIVÓ el nivel actual, no el último leído: la ventana se
    // resetea en cada evaluación, así que para cuando alguien consulta las
    // stats el valor en crudo ya volvió a ser bajo y no explicaría nada.
    _lagAtChange = lag
  }
}, EVAL_MS).unref()

/**
 * ¿Hay que descartar este comando por carga? Devuelve true para descartarlo.
 * El llamador NO debe responder nada al usuario — ver el comentario de arriba.
 */
export function shouldShed(priority: Priority): boolean {
  if (_level === 'normal') return false
  if (priority === 'critical' || priority === 'high') return false

  if (_level === 'critical') {
    // En crítico cae todo lo que no sea crítico o alto.
    _shed[priority === 'low' ? 'low' : 'normal']++
    return true
  }
  // Degradado: solo cae lo opcional.
  if (priority === 'low') {
    _shed.low++
    return true
  }
  return false
}

export function loadLevel(): LoadLevel { return _level }

export function loadStats(): {
  level:        LoadLevel
  lagMaxMs:     number   // último leído (ventana actual)
  lagAtLevelMs: number   // el que motivó el nivel actual
  shed:         { low: number; normal: number }
} {
  return {
    level:        _level,
    lagMaxMs:     Math.round(_lastLagMax),
    lagAtLevelMs: Math.round(_lagAtChange),
    shed:         { ..._shed },
  }
}
