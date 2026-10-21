// Reemplazo drop-in de useMultiFileAuthState (Baileys) que guarda cada
// archivo de sesión en CBOR en vez de JSON+base64.
//
// Por qué: creds.json y cada sender-key-*.json cargan sobre todo bytes
// binarios (claves Signal, firmas, hashes) — Baileys los serializa hoy como
// JSON con un replacer (BufferJSON) que convierte cada Buffer en un array de
// números decimales, ~4-5x más pesado que los bytes crudos y más lento de
// parsear. CBOR soporta bytes binarios nativos: mismo dato, sin ese inflado,
// sin perder el tipo (decode() devuelve Buffer real, no un array).
//
// Migración: si existe el .cbor se usa directo; si no, y hay un .json viejo
// (sesión de antes de este cambio), se lee con el reviver de Baileys, se
// reescribe como .cbor, y se borra el .json — cada archivo migra solo la
// primera vez que se toca, sin script aparte ni downtime.
//
// ─── Por qué el bot pedía QR "solo" ─────────────────────────────────────────
// Dos cosas juntas, y las dos estaban acá:
//
// 1. Se escribía EN EL LUGAR: writeFile abre el archivo truncándolo y después
//    escribe. Si el proceso muere entre esas dos cosas —cerrar la consola,
//    apagar, suspender, un kill del supervisor, Termux matado por Android—
//    creds.cbor queda vacío o a medias. creds.update se dispara seguido, así
//    que con el bot andando un día entero la ventana se abre muchas veces.
// 2. Al leerlo, un creds ilegible caía en el catch, devolvía null, y el
//    `|| initAuthCreds()` de abajo creaba credenciales NUEVAS sin decir nada:
//    una identidad que WhatsApp no conoce, o sea QR. Y el primer creds.update
//    las guardaba encima, borrando lo que quedaba del archivo roto.
//
// Ahora toda escritura va a un .tmp y se renombra encima (atómico: el archivo
// está entero en su versión vieja o en la nueva, nunca a medias), creds pasa
// además por fsync y deja una copia .bak de la versión anterior, y un creds
// ilegible se intenta recuperar del .bak antes de rendirse; si tampoco se
// puede, el roto se aparta con otro nombre en vez de pisarlo, y se dice.
import { Mutex } from 'async-mutex'
import { copyFile, mkdir, open, readFile, readdir, rename, stat, unlink, writeFile } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'
import { encode as cborEncode, decode as cborDecode } from 'cbor-x'
import { proto, initAuthCreds, BufferJSON } from '@whiskeysockets/baileys'
import type { AuthenticationState, AuthenticationCreds } from '@whiskeysockets/baileys'

const fileLocks = new Map<string, Mutex>()

function getFileLock(path: string): Mutex {
  let mutex = fileLocks.get(path)
  if (!mutex) {
    mutex = new Mutex()
    fileLocks.set(path, mutex)
  }
  return mutex
}

const fixFileName = (file: string): string =>
  file.replace(/\//g, '__').replace(/:/g, '-')

// mismo nombre lógico que Baileys (p. ej. "creds.json", "app-state-sync-key-ABC.json")
// pero se persiste con extensión .cbor — la entrada .json solo se usa para
// ubicar un archivo legado a migrar.
function cborPathFor(folder: string, file: string): string {
  const fixed = fixFileName(file)
  return join(folder, fixed.replace(/\.json$/, '.cbor'))
}

function legacyJsonPathFor(folder: string, file: string): string {
  return join(folder, fixFileName(file))
}

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms))

/**
 * Escribe `bytes` en `path` sin dejarlo nunca a medias: primero a `path.tmp`,
 * después rename encima. `durable` agrega fsync antes del rename —para creds,
 * que es lo único que no se puede reconstruir—; las claves Signal no lo
 * llevan porque se escriben por cientos y una perdida se renegocia sola.
 *
 * En Windows el rename puede fallar con EPERM/EBUSY si un antivirus o el
 * indexador tiene el destino abierto un instante: se reintenta un par de
 * veces antes de caer a la escritura directa de antes, que es peor pero no
 * pierde el dato.
 */
async function atomicWrite(path: string, bytes: Uint8Array, durable: boolean): Promise<void> {
  const tmp = `${path}.tmp`
  const fh = await open(tmp, 'w')
  try {
    await fh.writeFile(bytes)
    if (durable) await fh.sync()
  } finally {
    await fh.close()
  }
  for (let intento = 0; ; intento++) {
    try {
      await rename(tmp, path)
      return
    } catch (err: any) {
      if (intento < 3 && (err?.code === 'EPERM' || err?.code === 'EBUSY' || err?.code === 'EACCES')) {
        await sleep(50 * (intento + 1))
        continue
      }
      await writeFile(path, bytes)
      await unlink(tmp).catch(() => {})
      return
    }
  }
}

const CREDS_FILE = 'creds.json'

export const useMultiFileAuthStateCBOR = async (
  folder: string,
): Promise<{ state: AuthenticationState; saveCreds: () => Promise<void> }> => {
  const writeData = async (data: unknown, file: string): Promise<void> => {
    const filePath = cborPathFor(folder, file)
    const mutex = getFileLock(filePath)
    await mutex.acquire().then(async release => {
      try {
        if (file === CREDS_FILE) {
          // La versión que está en disco es entera (se escribió así), y es la
          // última que funcionó: se guarda como .bak antes de reemplazarla.
          await copyFile(filePath, `${filePath}.bak`).catch(() => {})
          await atomicWrite(filePath, cborEncode(data), true)
        } else {
          await atomicWrite(filePath, cborEncode(data), false)
        }
      } finally {
        release()
      }
    })
  }

  const readData = async (file: string): Promise<any> => {
    const filePath = cborPathFor(folder, file)
    const mutex = getFileLock(filePath)
    return mutex.acquire().then(async release => {
      try {
        try {
          const buf = await readFile(filePath)
          return cborDecode(buf)
        } catch {
          // Sin .cbor todavía — ¿hay un .json legado de antes de este cambio?
          const legacyPath = legacyJsonPathFor(folder, file)
          if (!existsSync(legacyPath)) return null
          try {
            const raw   = await readFile(legacyPath, { encoding: 'utf-8' })
            const value = JSON.parse(raw, BufferJSON.reviver)
            await writeFile(filePath, cborEncode(value)).catch(() => {})
            await unlink(legacyPath).catch(() => {})
            return value
          } catch {
            return null
          }
        }
      } finally {
        release()
      }
    })
  }

  const removeData = async (file: string): Promise<void> => {
    const filePath = cborPathFor(folder, file)
    const mutex = getFileLock(filePath)
    await mutex.acquire().then(async release => {
      try {
        await unlink(filePath).catch(() => {})
        await unlink(legacyJsonPathFor(folder, file)).catch(() => {})
      } finally {
        release()
      }
    })
  }

  const folderInfo = await stat(folder).catch(() => undefined)
  if (folderInfo) {
    if (!folderInfo.isDirectory()) {
      throw new Error(`Se encontró algo que no es una carpeta en ${folder} — borralo o usá otra ruta`)
    }
  } else {
    await mkdir(folder, { recursive: true })
  }

  // Restos de una escritura cortada a la mitad: el .tmp nunca llegó a
  // renombrarse, así que el archivo bueno es el otro. Se borran para que no se
  // acumulen.
  for (const f of await readdir(folder).catch(() => [] as string[])) {
    if (f.endsWith('.tmp')) await unlink(join(folder, f)).catch(() => {})
  }

  const creds: AuthenticationCreds = (await loadCreds(folder, readData)) || initAuthCreds()

  return {
    state: {
      creds,
      keys: {
        get: async (type, ids) => {
          const data: Record<string, any> = {}
          await Promise.all(ids.map(async id => {
            let value = await readData(`${type}-${id}.json`)
            if (type === 'app-state-sync-key' && value) {
              value = proto.Message.AppStateSyncKeyData.fromObject(value)
            }
            data[id] = value
          }))
          return data
        },
        set: async data => {
          const tasks: Promise<void>[] = []
          for (const category in data) {
            for (const id in (data as any)[category]) {
              const value = (data as any)[category][id]
              const file  = `${category}-${id}.json`
              tasks.push(value ? writeData(value, file) : removeData(file))
            }
          }
          await Promise.all(tasks)
        },
      },
    },
    saveCreds: async () => {
      await writeData(creds, 'creds.json')
    },
  }
}

/**
 * Lee creds sin crear nunca credenciales nuevas a escondidas.
 *
 * - creds.cbor legible → ese.
 * - No hay creds.cbor (ni .json viejo) → null: es la primera vez, QR.
 * - creds.cbor existe pero no se puede leer → el .bak, que es la versión
 *   anterior entera. Si sirve, se restaura en su lugar.
 * - Tampoco hay .bak → se aparta el roto como creds.cbor.roto-<fecha> y null.
 *   Va a pedir QR, pero diciéndolo, y el archivo queda para mirarlo. Antes de
 *   llegar acá, authVerifier ya intentó la copia de Rust al arrancar.
 */
async function loadCreds(
  folder: string,
  readData: (file: string) => Promise<any>,
): Promise<AuthenticationCreds | null> {
  const path = cborPathFor(folder, CREDS_FILE)
  const value = await readData(CREDS_FILE)
  if (value) return value
  if (!existsSync(path)) return null

  const { logger } = await import('@core/logger.js')
  try {
    const bak = cborDecode(await readFile(`${path}.bak`))
    if (bak && typeof bak === 'object' && (bak as any).noiseKey) {
      await copyFile(`${path}.bak`, path)
      logger.warn('[auth] creds.cbor ilegible — restaurado desde creds.cbor.bak, sin QR')
      return bak as AuthenticationCreds
    }
  } catch {}

  const aside = `${path}.roto-${new Date().toISOString().replace(/[:.]/g, '-')}`
  await rename(path, aside).catch(() => {})
  logger.error(`[auth] creds.cbor ilegible y sin copia que sirva — apartado como ${aside}. Hay que escanear QR.`)
  return null
}
