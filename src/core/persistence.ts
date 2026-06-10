import { writeFile, readFile, mkdir, rename } from 'fs/promises'
import { existsSync } from 'fs'
import { logger } from './logger.js'
import { userData, groupConfigs, clanData, userClan, defaultUserData, defaultGroupConfig } from './events/index.js'

// inventory y charCache se importan en tiempo de ejecución para evitar
// ciclos de dependencia con rollwaifu.ts
let _inventory: Map<string, any> | null = null
async function getInventory() {
  if (!_inventory) {
    const mod = await import('../plugins/commands/rpg/rollwaifu.js')
    _inventory = mod.inventory
  }
  return _inventory!
}

const DIR = './data'

// ─── Escritura atómica ────────────────────────────────────────────────────────
async function atomicWrite(path: string, data: string): Promise<void> {
  await mkdir(DIR, { recursive: true })
  const tmp = path + '.tmp'
  await writeFile(tmp, data, 'utf-8')
  await rename(tmp, path)
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

async function loadGroups(): Promise<void> {
  const path = `${DIR}/groups.json`
  if (!existsSync(path)) return
  try {
    const raw: Record<string, any> = JSON.parse(await readFile(path, 'utf-8'))
    for (const [jid, cfg] of Object.entries(raw)) {
      groupConfigs.set(jid, { ...defaultGroupConfig(), ...cfg })
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
