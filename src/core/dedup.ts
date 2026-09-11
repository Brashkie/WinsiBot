// ─────────────────────────────────────────────────────────────────────────────
//  WinsiBot — DEDUPLICACIÓN DE MENSAJES ENTRANTES
//
//  Baileys puede entregar el MISMO mensaje más de una vez, y en este bot no es
//  un caso raro:
//
//   1. socket.ts acepta `type === 'append'` — mensajes que Baileys re-entrega
//      después de un sync — filtrando solo por antigüedad (<5 min). Un mensaje
//      que ya llegó como 'notify' y se procesó puede volver como 'append'
//      dentro de esa ventana.
//   2. El buffer de eventos de Baileys se activa en CADA reconexión, no solo
//      al arrancar (ver el comentario de messages.upsert en socket.ts), y las
//      reconexiones por Bad MAC son habituales en grupos activos.
//
//  Sin este filtro, un `#daily` seguido de una reconexión dentro de los 5
//  minutos se ejecuta dos veces: dinero duplicado, cooldown pisado, XP doble.
//  El handler no tenía NINGUNA protección por id de mensaje.
//
//  Por qué en disco y no en un Set en memoria: el otro escenario es procesar
//  un comando, reiniciar (el supervisor lo hace solo ante un crash o un
//  cuelgue), y que Baileys re-entregue ese mensaje en el sync del arranque.
//  Un Set se pierde justo cuando hace falta. El AOF de strenor sobrevive.
//
//  Coste: es in-process y síncrono (microsegundos), así que puede ir en el
//  camino crítico de cada mensaje sin añadir latencia — a diferencia de
//  preguntarle a Rust por HTTP.
// ─────────────────────────────────────────────────────────────────────────────

import { mkdirSync } from 'fs'
import { Strenor } from 'strenor'
import { logger } from './logger.js'

const AOF_PATH = './data/dedup.aof'

// 10 min: el doble de la ventana de 'append' (5 min) que ya filtra socket.ts,
// con margen para que un reinicio no deje pasar lo que estaba justo en el borde.
const TTL_MS = 10 * 60_000

// Barrido frecuente: son claves de vida corta y muchas, no conviene que se
// acumulen esperando al sweep.
const SWEEP_MS = 60_000

// El log crece con cada mensaje entrante. Con TTL de 10 min lo vivo es siempre
// poco, así que compactar en cuanto pase de unos pocos MB lo mantiene chico.
const COMPACT_THRESHOLD_BYTES = 2 * 1024 * 1024

mkdirSync('./data', { recursive: true })

const store = new Strenor({ aof: AOF_PATH, sweepInterval: SWEEP_MS })

const recovery = store.recovery
if (recovery?.truncated) {
  logger.warn(`Dedup: cola del log truncada al recuperar — ${recovery.applied} registros aplicados`)
}

let _duplicates = 0
let _seen       = 0

/**
 * Devuelve true si esta instancia ya procesó ese id de mensaje — el llamador
 * debe descartarlo. Si es la primera vez, lo registra y devuelve false.
 *
 * `scope` es OBLIGATORIO y separa al bot principal de cada sub-bot: los ids de
 * mensaje son globales de WhatsApp, así que un mensaje en un grupo donde están
 * el bot principal y un sub-bot llega a los dos. Con un espacio de claves
 * compartido, el que llegara segundo lo vería como duplicado y dejaría de
 * responder — cada instancia tiene que procesar lo suyo.
 *
 * Un id vacío deja pasar el mensaje: preferimos procesar de más que descartar
 * algo legítimo por no poder identificarlo.
 */
export function alreadyProcessed(scope: string, id: string | null | undefined): boolean {
  if (!id) return false

  const key = `${scope}:${id}`

  _seen++
  if (store.exists(key)) {
    _duplicates++
    return true
  }

  store.set(key, 1, { ttl: TTL_MS })

  if (store.aofSize() > COMPACT_THRESHOLD_BYTES) store.compact()
  return false
}

export function dedupStats(): { seen: number; duplicates: number; tracked: number } {
  return { seen: _seen, duplicates: _duplicates, tracked: store.size() }
}

// Reporte periódico — sirve para saber si esto estaba pasando de verdad y con
// qué frecuencia, en vez de suponerlo. Solo loguea si hubo duplicados.
const REPORT_MS = 30 * 60_000
setInterval(() => {
  if (_duplicates === 0) return
  const pct = ((_duplicates / Math.max(1, _seen)) * 100).toFixed(2)
  logger.info(`Dedup: ${_duplicates} mensajes duplicados descartados de ${_seen} (${pct}%)`)
}, REPORT_MS).unref()

process.once('exit', () => store.close())
