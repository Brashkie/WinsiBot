// ─────────────────────────────────────────────────────────────────────────────
//  WinsiBot — KV EMBEBIDO (strenor)
//
//  Reemplaza a lib/db.ts (better-sqlite3). Aquel montaba SQLite entero —tablas
//  users/groups/clans + un kv genérico— pero en la práctica nadie llamaba a
//  loadAll() ni a markDirty(): la persistencia real de usuarios/grupos vive en
//  core/persistence.ts, y lo único que SQLite guardaba de verdad eran los
//  tokens de sesión del dashboard. Se pagaba una dependencia nativa que
//  compila con node-gyp (en Termux, desde fuente) por 4 llamadas.
//
//  strenor es también nativo, pero por NAPI-RS: la ABI es estable entre
//  versiones de Node y trae binarios precompilados para las 10 plataformas
//  soportadas, Android/Termux incluido. No es un detalle teórico — el
//  better_sqlite3.node que había en node_modules estaba compilado contra
//  NODE_MODULE_VERSION 127 (Node 22) y ya no cargaba en el Node 24 actual.
//
//  Además el TTL ahora es real. auth.ts comparaba createdAt a mano y solo
//  borraba la sesión vencida si alguien volvía a presentar ese token — las
//  sesiones de 30 días que nadie reusaba quedaban en la tabla para siempre.
//  Acá expiran solas y el sweep de fondo las saca.
//
//  Uso:
//    import { kv } from '@lib/kv.js'
//    kv.set('web_session:abc', session, { ttl: 30 * 86400_000 })
//    kv.get<Session>('web_session:abc')   // null si no existe o venció
//    kv.del('web_session:abc')
// ─────────────────────────────────────────────────────────────────────────────

import { mkdirSync } from 'fs'
import { Strenor } from 'strenor'
import { logger } from '../core/logger.js'

const AOF_PATH = './data/kv.aof'

// Cada mutación se apendea al log y se relee al abrir, así que las sesiones
// sobreviven un reinicio (que es todo el punto de haberlas guardado en disco).
const SWEEP_MS = 5 * 60_000

// fsync:false a propósito. Con fsync cada write va a disco antes de devolver;
// en Windows con antivirus de por medio eso puede tardar segundos de verdad
// (ya pasó con el /write de la API de Rust — ver el comentario de
// FETCH_TIMEOUT_MS en lib/session.ts). Sin fsync, un crash del *proceso* no
// pierde nada igual (la escritura ya está en el SO); solo un corte de luz se
// llevaría los últimos writes. Para tokens de sesión web ese trade está bien:
// el peor caso es que alguien vuelva a hacer #login.
const FSYNC = false

// El AOF crece con cada login/logout. Compactar de arranque si se fue de
// tamaño evita que el log de meses tarde en releerse en cada boot.
const COMPACT_THRESHOLD_BYTES = 1024 * 1024

mkdirSync('./data', { recursive: true })

export const kv = new Strenor({
  aof:           AOF_PATH,
  fsync:         FSYNC,
  sweepInterval: SWEEP_MS,
})

const recovery = kv.recovery
if (recovery) {
  if (recovery.truncated) {
    // El proceso anterior murió en mitad de una escritura — strenor descarta
    // esa cola rota (valida CRC-32 por registro) y sigue con lo demás.
    logger.warn(`KV: cola del log truncada al recuperar — ${recovery.applied} registros aplicados`)
  } else {
    logger.info(`KV listo → ${AOF_PATH} (${recovery.applied} registros, ${kv.size()} claves)`)
  }
}

if (kv.aofSize() > COMPACT_THRESHOLD_BYTES) {
  const bytes = kv.compact()
  logger.info(`KV: log compactado → ${bytes} bytes`)
}

// Solo 'exit', igual que hacía db.ts — index.ts ya tiene el shutdown completo
// (saveAll, cerrar subbots, etc.) y 'exit' corre siempre al final, sin importar
// cómo salió el proceso.
process.once('exit', () => kv.close())
