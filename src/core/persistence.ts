import { writeFile, readFile, mkdir, rename } from 'fs/promises'
import { existsSync } from 'fs'
import { createHash } from 'crypto'
import { Strenor } from 'strenor'
import { logger } from './logger.js'
import { userData, groupConfigs, clanData, userClan, defaultUserData, defaultGroupConfig } from './events/index.js'

// inventory y charCache se importan en tiempo de ejecución para evitar
// ciclos de dependencia con rollwaifu.ts
let _inventory: Map<string, any> | null = null
let _rebuildGroupClaims: (() => void) | null = null
async function getInventory() {
  if (!_inventory) {
    const mod = await import('../plugins/commands/rpg/rollwaifu.js')
    _inventory = mod.inventory
    _rebuildGroupClaims = mod.rebuildGroupClaims
  }
  return _inventory!
}

const DIR = './data'

// ─── Escritura atómica ────────────────────────────────────────────────────────
// Dos problemas reales cuando dos atomicWrite() al MISMO path se solapan
// (p. ej. el autoguardado cada 30s coincidiendo con el guardado final al
// cerrar sesión/SIGTERM/SIGINT):
//  1. Con un nombre de temporal fijo, ambas escrituras comparten el mismo
//     ".tmp" — el primer rename() que termina se lo lleva, y el segundo
//     falla con ENOENT porque ya no existe.
//  2. Aun con temporales únicos por-llamada (arreglando el ENOENT), en
//     Windows dos rename() concurrentes hacia el MISMO destino final pueden
//     fallar con EPERM — NTFS bloquea brevemente el destino durante un
//     rename, y el segundo choca contra ese lock (confirmado con una prueba
//     de 10 escrituras concurrentes reales).
// La solución real es serializar: nunca dejar que dos escrituras al mismo
// path corran a la vez. _writeLocks encadena cada atomicWrite() al anterior
// PARA ESE PATH — nunca se solapan, sea cual sea el resultado del anterior.
// Escrituras a paths DISTINTOS (users.json vs groups.json, etc.) siguen
// corriendo en paralelo entre sí, sin perder el paralelismo de saveAll().
let _writeSeq = 0
const _writeLocks = new Map<string, Promise<void>>()

async function atomicWrite(path: string, data: string): Promise<void> {
  const prevLock = _writeLocks.get(path) ?? Promise.resolve()

  const thisWrite = prevLock.then(async () => {
    await mkdir(DIR, { recursive: true })
    const tmp = `${path}.${process.pid}.${++_writeSeq}.tmp`
    await writeFile(tmp, data, 'utf-8')
    await rename(tmp, path)
  })

  // El anchor guardado para el próximo encadenamiento NUNCA debe rechazar
  // (si no, un fallo acá rompería la cola para las próximas escrituras a
  // este path) — pero thisWrite (lo que se devuelve) sí preserva el error
  // real para que saveGroups()/etc. lo loguee normalmente.
  _writeLocks.set(path, thisWrite.then(() => {}, () => {}))

  return thisWrite
}

// ─── Escribir solo si el contenido cambió ─────────────────────────────────────
// startAutoSave() llamaba saveAll() cada 30s pase lo que pase, así que los
// ~2.6 MB de users+groups+inventory+clans se reserializaban Y reescribían
// enteros aunque nadie hubiera tocado nada: 7.2 GB al día contra el disco, la
// mayoría idénticos al byte anterior. En Termux/Android eso es desgaste de
// flash a cambio de nada.
//
// El descarte se hace por hash del contenido, no con un flag markDirty()
// manual: userData se muta en 111 sitios y muchos lo hacen sobre el objeto
// que devuelve getUserData() (`user.exp += ...` en xp.ts, por ejemplo), sin
// pasar por setUserData(). Un flag habría que acordarse de levantarlo en cada
// uno de esos sitios, y olvidarse en uno solo significa perder datos en
// silencio. Comparar el contenido no puede equivocarse: si cambió, se escribe.
//
// Lo que se ahorra es el I/O (~80 ms de los ~99 ms del ciclo), no el
// JSON.stringify — hay que serializar igual para saber si cambió. El hash de
// los 2.6 MB cuesta ~8 ms.
//
// Sin inicializar los hashes al cargar a propósito: el primer guardado tras
// arrancar siempre escribe, y así quedan persistidos los campos que loadUsers()
// /loadGroups() rellenan con los defaults nuevos al mezclar.
const _lastHash = new Map<string, string>()

async function writeIfChanged(path: string, data: string): Promise<boolean> {
  const hash = createHash('sha1').update(data).digest('hex')
  // El existsSync no es paranoia gratuita: sin él, si el archivo desaparece
  // del disco con el bot corriendo (borrado a mano, limpieza de data/, un
  // backup mal hecho), el hash en memoria seguiría diciendo "sin cambios" y
  // no se regeneraría nunca — y al morir el proceso esos datos ya no están en
  // ningún lado. Antes de este cambio se reescribía solo a los 30s.
  if (_lastHash.get(path) === hash && existsSync(path)) return false
  await atomicWrite(path, data)
  _lastHash.set(path, hash)
  return true
}

// ─── Store de usuarios (log de deltas) ───────────────────────────────────────
// users.json eran 2.2 MB reescritos ENTEROS cada 30s. Como xp.ts da XP en cada
// mensaje, en horas activas siempre había algún cambio, así que el hash de
// writeIfChanged() casi nunca lo salvaba: ~6 GB/día para persistir unos pocos
// cientos de bytes que de verdad cambiaron.
//
// Ahora cada usuario es una clave suya en un log append-only. En cada ciclo se
// serializa todo igual (no hay forma barata de saber qué cambió sin hacerlo:
// userData se muta en 111 sitios, muchos directamente sobre el objeto que
// devuelve getUserData), pero solo se ESCRIBEN los que cambiaron — de 2.2 MB
// por ciclo a ~870 bytes por usuario tocado. Hashear los 2557 uno por uno
// cuesta 27 ms contra los 24 ms de hashear el archivo entero: la granularidad
// fina sale casi gratis.
//
// El valor se guarda con setString() del JSON ya serializado para el hash, en
// vez de set(), para no pagar una segunda serialización dentro de strenor.
const USERS_AOF   = `${DIR}/users.aof`
const USERS_JSON  = `${DIR}/users.json`
const USERS_BAK   = `${DIR}/users.json.migrated`
const USER_PREFIX = 'user:'

// Compactar cuando el log crezca a más de 4x los datos vivos (~900 B por
// usuario). Sin esto crecería sin tope —cada delta se apendea— y el replay del
// arranque se volvería más lento cada día.
const COMPACT_FACTOR    = 4
const COMPACT_MIN_BYTES = 8 * 1024 * 1024

const sha1 = (s: string): string => createHash('sha1').update(s).digest('hex')

// jid → hash del último estado escrito. Sirve además para detectar bajas:
// un jid acá que ya no esté en userData es un usuario borrado (resetuser.ts).
const _userHash = new Map<string, string>()

let _userStore: Strenor | null = null

function userStore(): Strenor {
  if (!_userStore) {
    _userStore = new Strenor({ aof: USERS_AOF })
    const rec = _userStore.recovery
    if (rec?.truncated) {
      logger.warn(`Persistence: cola del log de usuarios truncada — ${rec.applied} registros aplicados`)
    }
  }
  return _userStore
}

function maybeCompactUsers(store: Strenor): void {
  const size = store.aofSize()
  if (size < COMPACT_MIN_BYTES) return
  if (size <= userData.size * 900 * COMPACT_FACTOR) return
  const after = store.compact()
  logger.info(`Persistence: log de usuarios compactado — ${(size / 1024 / 1024).toFixed(1)} MB → ${(after / 1024 / 1024).toFixed(1)} MB`)
}

// ─── Carga ────────────────────────────────────────────────────────────────────
export async function loadAll(): Promise<void> {
  await loadUsers()
  await loadGroups()
  await loadInventory()
  await loadClans()
}

async function loadUsers(): Promise<void> {
  try {
    const store = userStore()
    const keys  = store.keys().filter(k => k.startsWith(USER_PREFIX))

    // Primer arranque tras el cambio de formato: sembrar el log desde el
    // users.json de siempre. El original NO se borra, se renombra a
    // users.json.migrated — si el log se pierde, se restaura con:
    //   node scripts/users.js import data/users.json.migrated
    if (keys.length === 0) {
      if (existsSync(USERS_JSON)) { await migrateUsersFromJson(store); return }
      if (existsSync(USERS_BAK)) {
        // El log está vacío pero hay un respaldo de la migración. No se carga
        // solo: un log vacío también es lo que deja un reset deliberado, y
        // resucitar datos viejos por las nuestras sería peor que no hacer nada.
        logger.warn(`Persistence: log de usuarios vacío, pero existe ${USERS_BAK} — restaurar con: node scripts/users.js import ${USERS_BAK}`)
      }
      return
    }

    for (const key of keys) {
      const json = store.getString(key)
      if (!json) continue
      const jid  = key.slice(USER_PREFIX.length)
      const data = JSON.parse(json)
      // Mezclar con defaults para rellenar campos nuevos que no existían antes
      const merged = { ...defaultUserData(data.name ?? ''), ...data }
      userData.set(jid, merged)
      // El hash se toma del objeto YA mezclado, no del JSON leído: si no, el
      // primer saveUsers() vería un hash distinto para los 2557 y reescribiría
      // el padrón entero en cada arranque. Los defaults rellenados se
      // persisten cuando ese usuario cambie por cualquier otro motivo; volver
      // a rellenarlos en cada carga es idempotente.
      _userHash.set(jid, sha1(JSON.stringify(merged)))
    }

    logger.info(`Persistence: ${userData.size} usuarios cargados`)
    maybeCompactUsers(store)
  } catch (err) {
    logger.error({ err }, 'Persistence: error cargando el log de usuarios')
  }
}

async function migrateUsersFromJson(store: Strenor): Promise<void> {
  const raw: Record<string, any> = JSON.parse(await readFile(USERS_JSON, 'utf-8'))
  store.batch(() => {
    for (const [jid, data] of Object.entries(raw)) {
      const merged = { ...defaultUserData(data.name ?? ''), ...data }
      userData.set(jid, merged)
      const json = JSON.stringify(merged)
      store.setString(`${USER_PREFIX}${jid}`, json)
      _userHash.set(jid, sha1(json))
    }
  })
  await rename(USERS_JSON, USERS_BAK)
  logger.info(`Persistence: ${userData.size} usuarios migrados a ${USERS_AOF} (respaldo en ${USERS_BAK})`)
}

// Migración única: `autolevelup` pasó de default true → false, pero los
// grupos que ya tenían groups.json guardado de antes tienen el valor viejo
// escrito explícito (saveGroups serializa el objeto completo, no un diff),
// así que el nuevo default en código no les llega — hay que bajarlo una
// sola vez acá. El marker evita que esto vuelva a pisar a un admin que
// después lo prenda a propósito con !on levelup.
const MIGRATIONS_PATH = `${DIR}/.migrations.json`

async function loadMigrations(): Promise<Record<string, boolean>> {
  try {
    return JSON.parse(await readFile(MIGRATIONS_PATH, 'utf-8'))
  } catch {
    return {}
  }
}

async function saveMigrations(migrations: Record<string, boolean>): Promise<void> {
  await atomicWrite(MIGRATIONS_PATH, JSON.stringify(migrations))
}

async function loadGroups(): Promise<void> {
  const path = `${DIR}/groups.json`
  if (!existsSync(path)) return
  try {
    const raw: Record<string, any> = JSON.parse(await readFile(path, 'utf-8'))
    const migrations = await loadMigrations()
    const needsAutolevelupMigration = !migrations.autolevelupOffByDefault

    for (const [jid, cfg] of Object.entries(raw)) {
      if (needsAutolevelupMigration) cfg.autolevelup = false
      groupConfigs.set(jid, { ...defaultGroupConfig(), ...cfg })
    }

    if (needsAutolevelupMigration) {
      migrations.autolevelupOffByDefault = true
      await saveMigrations(migrations)
      logger.info(`Persistence: migración aplicada — autolevelup desactivado en ${groupConfigs.size} grupos existentes`)
    }

    logger.info(`Persistence: ${groupConfigs.size} grupos cargados`)
  } catch (err) {
    logger.error({ err }, 'Persistence: error cargando groups.json')
  }
}

async function loadInventory(): Promise<void> {
  const path = `${DIR}/inventory.json`
  if (!existsSync(path)) return
  try {
    const inv = await getInventory()
    const raw: Record<string, any[]> = JSON.parse(await readFile(path, 'utf-8'))
    for (const [jid, chars] of Object.entries(raw)) {
      inv.set(jid, chars)
    }
    // Reconstruye el índice de exclusividad por grupo desde el inventario
    // recién cargado — sin esto, tras reiniciar el bot los personajes ya
    // reclamados volverían a estar disponibles en su grupo.
    _rebuildGroupClaims?.()
    logger.info(`Persistence: ${inv.size} inventarios cargados`)
  } catch (err) {
    logger.error({ err }, 'Persistence: error cargando inventory.json')
  }
}

async function loadClans(): Promise<void> {
  const path = `${DIR}/clans.json`
  if (!existsSync(path)) return
  try {
    const raw = JSON.parse(await readFile(path, 'utf-8'))
    for (const [tag, clan] of Object.entries(raw.clans ?? {})) {
      clanData.set(tag, clan as any)
    }
    for (const [jid, tag] of Object.entries(raw.userClan ?? {})) {
      userClan.set(jid, tag as string)
    }
    logger.info(`Persistence: ${clanData.size} clanes cargados`)
  } catch (err) {
    logger.error({ err }, 'Persistence: error cargando clans.json')
  }
}

// ─── Guardado ─────────────────────────────────────────────────────────────────
export async function saveAll(): Promise<void> {
  await Promise.all([saveUsers(), saveGroups(), saveInventory(), saveClans()])
}

async function saveUsers(): Promise<void> {
  try {
    const store = userStore()

    store.batch(() => {
      for (const [jid, data] of userData) {
        const json = JSON.stringify(data)
        const hash = sha1(json)
        if (_userHash.get(jid) === hash) continue
        store.setString(`${USER_PREFIX}${jid}`, json)
        _userHash.set(jid, hash)
      }

      // Bajas: un jid con hash guardado que ya no está en userData es un
      // usuario borrado (resetuser.ts). Sin esto volvería del log al reiniciar.
      for (const jid of _userHash.keys()) {
        if (userData.has(jid)) continue
        store.del(`${USER_PREFIX}${jid}`)
        _userHash.delete(jid)
      }
    })

    maybeCompactUsers(store)
  } catch (err) {
    logger.error({ err }, 'Persistence: error guardando el log de usuarios')
  }
}

async function saveGroups(): Promise<void> {
  try {
    await writeIfChanged(
      `${DIR}/groups.json`,
      JSON.stringify(Object.fromEntries(groupConfigs)),
    )
  } catch (err) {
    logger.error({ err }, 'Persistence: error guardando groups.json')
  }
}

async function saveInventory(): Promise<void> {
  try {
    const inv = await getInventory()
    await writeIfChanged(
      `${DIR}/inventory.json`,
      JSON.stringify(Object.fromEntries(inv)),
    )
  } catch (err) {
    logger.error({ err }, 'Persistence: error guardando inventory.json')
  }
}

async function saveClans(): Promise<void> {
  try {
    await writeIfChanged(
      `${DIR}/clans.json`,
      JSON.stringify({
        clans:    Object.fromEntries(clanData),
        userClan: Object.fromEntries(userClan),
      }),
    )
  } catch (err) {
    logger.error({ err }, 'Persistence: error guardando clans.json')
  }
}

// ─── Auto-guardado periódico ──────────────────────────────────────────────────
let _timer: ReturnType<typeof setInterval> | null = null

export function startAutoSave(intervalMs = 30_000): void {
  if (_timer) clearInterval(_timer)
  _timer = setInterval(() => saveAll().catch(() => {}), intervalMs)
  _timer.unref()   // no impide que el proceso salga si no hay más trabajo
  logger.debug(`Persistence: auto-guardado cada ${intervalMs / 1000}s`)
}

/** Frena el ticker periódico — llamar antes del guardado final al apagar
 *  (SIGINT/SIGTERM/logout), para no competir con un autoguardado en curso. */
export function stopAutoSave(): void {
  if (_timer) clearInterval(_timer)
  _timer = null
}

// Igual que hacía lib/db.ts: solo 'exit'. index.ts ya tiene el shutdown
// completo, y 'exit' corre siempre al final sin importar cómo salió el proceso.
// Con fsync desactivado los writes ya están en manos del SO al volver de set(),
// así que un crash del proceso no pierde nada aunque no se llegue a cerrar.
process.once('exit', () => _userStore?.close())
