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
import { Mutex } from 'async-mutex'
import { mkdir, readFile, stat, unlink, writeFile } from 'fs/promises'
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

export const useMultiFileAuthStateCBOR = async (
  folder: string,
): Promise<{ state: AuthenticationState; saveCreds: () => Promise<void> }> => {
  const writeData = async (data: unknown, file: string): Promise<void> => {
    const filePath = cborPathFor(folder, file)
    const mutex = getFileLock(filePath)
    await mutex.acquire().then(async release => {
      try {
        await writeFile(filePath, cborEncode(data))
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

  const creds: AuthenticationCreds = (await readData('creds.json')) || initAuthCreds()

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
