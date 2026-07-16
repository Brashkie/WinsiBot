import { writeFile, readFile, mkdir, rename } from 'fs/promises'
import { existsSync } from 'fs'
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

// ─── Carga ────────────────────────────────────────────────────────────────────
export async function loadAll(): Promise<void> {
  await loadUsers()
  await loadGroups()
  await loadInventory()
  await loadClans()
}

async function loadUsers(): Promise<void> {
  const path = `${DIR}/users.json`
  if (!existsSync(path)) return
  try {
    const raw: Record<string, any> = JSON.parse(await readFile(path, 'utf-8'))
    for (const [jid, data] of Object.entries(raw)) {
      // Mezclar con defaults para rellenar campos nuevos que no existían antes
      userData.set(jid, { ...defaultUserData(data.name ?? ''), ...data })
    }
    logger.info(`Persistence: ${userData.size} usuarios cargados`)
  } catch (err) {
    logger.error({ err }, 'Persistence: error cargando users.json')
  }
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
    await atomicWrite(
      `${DIR}/users.json`,
      JSON.stringify(Object.fromEntries(userData)),
    )
  } catch (err) {
    logger.error({ err }, 'Persistence: error guardando users.json')
  }
}

async function saveGroups(): Promise<void> {
  try {
    await atomicWrite(
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
    await atomicWrite(
      `${DIR}/inventory.json`,
      JSON.stringify(Object.fromEntries(inv)),
    )
  } catch (err) {
    logger.error({ err }, 'Persistence: error guardando inventory.json')
  }
}

async function saveClans(): Promise<void> {
  try {
    await atomicWrite(
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
