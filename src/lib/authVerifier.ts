/**
 * authVerifier.ts — Verifica la integridad criptográfica del directorio auth/
 * antes de pasárselo a Baileys.
 *
 * Problema que resuelve:
 *   Con el flujo anterior el bot descubría claves corruptas en tiempo de
 *   descifrado → Bad MAC → detecta → limpia → reconecta.
 *
 *   Con este verificador el flujo es:
 *   bot arranca → verifica integridad (Curve25519 derivación determinista)
 *   → borra solo los archivos inválidos → Baileys arranca limpio.
 *
 * Qué verifica:
 *   - noiseKey, pairingEphemeralKeyPair, signedIdentityKey, signedPreKey:
 *     publicFromPrivate(priv) === stored_pub  (Curve25519 determinista)
 *   - pre-key-N.json: igual verificación por par
 *   - sender-key-*.json y session-*.json: JSON parseable + tamaños de buffer válidos
 *   - Todos los buffers de clave deben ser exactamente 32 bytes
 *
 * Qué NO modifica:
 *   - creds.json/creds.cbor — si está corrupto el bot necesita QR nuevo (se reporta pero no se borra)
 *   - Archivos de app-state-sync (solo se validan como parseables)
 *
 * Formatos soportados:
 *   Lee tanto .json (BufferJSON de Baileys — Buffers envueltos en
 *   {type:'Buffer',data:base64}) como .cbor (authStateCbor.ts — Buffers
 *   nativos, sin envoltorio). extractBytes() normaliza cualquiera de las dos
 *   formas (más el Buffer.toJSON() nativo de Node que usa el backup de Rust)
 *   a un Buffer real antes de validar — el resto de la lógica de verificación
 *   es igual sin importar de qué formato vino el archivo.
 */

import { readdir, readFile, writeFile, unlink } from 'fs/promises'
import { join } from 'path'
import { encode as cborEncode, decode as cborDecode } from 'cbor-x'
import { logger } from '@core/logger.js'
import {
  Curve25519,
  Base64,
  Utf8,
  constantTimeEqual,
  CURVE25519_PRIVATE_KEY_SIZE,
  CURVE25519_PUBLIC_KEY_SIZE,
} from '@brashkie/signalis-core'

// ─── Tipos internos ───────────────────────────────────────────────────────────

interface VerifyReport {
  totalFiles:    number
  valid:         number
  corrupted:     string[]   // archivos con claves inválidas
  unparseable:   string[]   // archivos que no son JSON válido
  deleted:       string[]   // archivos eliminados
  credsStatus:   'ok' | 'corrupted' | 'missing'
}

// Representación serializada de un Buffer en Baileys ({"type":"Buffer","data":"base64=="})
interface BaileysBuffer {
  type: 'Buffer'
  data: string    // base64
}

function isBaileysBuffer(v: unknown): v is BaileysBuffer {
  return (
    typeof v === 'object' && v !== null &&
    (v as any).type === 'Buffer' &&
    typeof (v as any).data === 'string'
  )
}

// Buffer serializado por Node.js (Buffer.toJSON()) — usado en las estructuras
// ANIDADAS de sender-key-*.json (a diferencia del BaileysBuffer de nivel superior,
// que codifica en base64, estas anidadas guardan un array de bytes).
function isNodeBufferJson(v: unknown): v is { type: 'Buffer'; data: number[] } {
  return (
    typeof v === 'object' && v !== null &&
    (v as any).type === 'Buffer' &&
    Array.isArray((v as any).data)
  )
}

// Extrae los bytes crudos de un campo sin importar de qué formato vino:
//   - Buffer/Uint8Array real (.cbor — cbor-x decodifica bytes nativos así)
//   - {type:'Buffer', data: base64} (.json — BufferJSON de Baileys)
//   - {type:'Buffer', data: [n,n,...]} (Buffer.toJSON() nativo de Node —
//     usado por el backup de Rust, que serializa con JSON.stringify plano)
// Base64.decode() de signalis-core es estricto (lanza en base64 malformado),
// a diferencia de Buffer.from(str,'base64') que ignora bytes corruptos.
function extractBytes(value: unknown): Buffer | null {
  if (Buffer.isBuffer(value)) return value
  if (value instanceof Uint8Array) return Buffer.from(value)
  if (isBaileysBuffer(value)) {
    try { return Base64.decode(value.data) } catch { return null }
  }
  if (isNodeBufferJson(value)) return Buffer.from(value.data)
  return null
}

// Recorre un objeto (p. ej. creds recuperados de Rust) y convierte cualquier
// Buffer envuelto ({type:'Buffer',data:...} en cualquiera de sus dos formas)
// a un Buffer real — necesario antes de guardar en CBOR, que si no
// preservaría el envoltorio literal en vez de los bytes que representa.
function normalizeCredsBuffers(value: any): any {
  const asBuf = extractBytes(value)
  if (asBuf) return asBuf
  if (Array.isArray(value)) return value.map(normalizeCredsBuffers)
  if (value !== null && typeof value === 'object') {
    const out: Record<string, any> = {}
    for (const k of Object.keys(value)) out[k] = normalizeCredsBuffers(value[k])
    return out
  }
  return value
}

// Lee y parsea un archivo de auth sin importar su formato de serialización.
function readAuthFile(path: string): Promise<Record<string, any>> {
  if (path.endsWith('.cbor')) {
    return readFile(path).then(buf => cborDecode(buf))
  }
  return readFile(path, 'utf-8').then(content => JSON.parse(content))
}

// Valida un campo opcional codificado en base64 (string plano, sin envoltorio
// BaileysBuffer — así es como libsignal-node guarda las claves dentro de
// session-*.json). Ausente = válido, ya que no todos los campos existen en
// todos los estados de sesión (p. ej. pendingPreKey es opcional).
function isValidB64Field(value: unknown, allowedSizes: number[]): boolean {
  if (value === undefined || value === null) return true
  if (typeof value !== 'string') return false
  try {
    return allowedSizes.includes(Base64.decode(value).length)
  } catch {
    return false
  }
}

// ─── Verificar par de claves Curve25519 ──────────────────────────────────────
// El núcleo del verificador: Curve25519 es determinista — dado el private,
// el public SIEMPRE es el mismo. Si no coinciden, la clave está corrupta.
function verifyKeyPairBytes(privBuf: Buffer, pubBuf: Buffer): boolean {
  try {
    if (privBuf.length !== CURVE25519_PRIVATE_KEY_SIZE) return false
    if (pubBuf.length  !== CURVE25519_PUBLIC_KEY_SIZE)  return false

    const expectedPub = Curve25519.publicFromPrivate(privBuf)
    return constantTimeEqual(expectedPub, pubBuf)
  } catch {
    return false
  }
}

// ─── Verificar creds.json ─────────────────────────────────────────────────────
function verifyCreds(raw: Record<string, any>): { ok: boolean; failed: string[] } {
  const failed: string[] = []

  // Pares de claves en creds que podemos verificar con Curve25519
  const keyPairFields: Array<{
    path:    string
    private: unknown
    public:  unknown
  }> = [
    {
      path:    'noiseKey',
      private: raw.noiseKey?.private,
      public:  raw.noiseKey?.public,
    },
    {
      path:    'pairingEphemeralKeyPair',
      private: raw.pairingEphemeralKeyPair?.private,
      public:  raw.pairingEphemeralKeyPair?.public,
    },
    {
      path:    'signedIdentityKey',
      private: raw.signedIdentityKey?.private,
      public:  raw.signedIdentityKey?.public,
    },
    {
      path:    'signedPreKey.keyPair',
      private: raw.signedPreKey?.keyPair?.private,
      public:  raw.signedPreKey?.keyPair?.public,
    },
  ]

  for (const field of keyPairFields) {
    const privBuf = extractBytes(field.private)
    const pubBuf  = extractBytes(field.public)
    if (!privBuf || !pubBuf) {
      failed.push(`${field.path} — estructura inválida (no se pudo extraer el buffer)`)
      continue
    }
    if (!verifyKeyPairBytes(privBuf, pubBuf)) {
      failed.push(`${field.path} — publicFromPrivate no coincide (corrupto)`)
    }
  }

  // signedPreKey signature debe existir y tener 64 bytes
  const sigBytes = extractBytes(raw.signedPreKey?.signature)
  if (sigBytes) {
    if (sigBytes.length !== 64) {
      failed.push(`signedPreKey.signature — tamaño inválido (${sigBytes.length} bytes, esperado 64)`)
    }
  } else {
    failed.push('signedPreKey.signature — falta o inválido')
  }

  return { ok: failed.length === 0, failed }
}

// ─── Verificar pre-key-N.json/.cbor ───────────────────────────────────────────
function verifyPreKey(raw: Record<string, any>): boolean {
  const privBuf = extractBytes(raw.private)
  const pubBuf  = extractBytes(raw.public)
  if (!privBuf || !pubBuf) return false
  return verifyKeyPairBytes(privBuf, pubBuf)
}

// ─── Verificar sender-key-*.json/.cbor ────────────────────────────────────────
// El archivo completo es un Buffer (base64-envuelto en .json, nativo en .cbor)
// que al decodificarse da un string UTF-8 con un array JSON de estados
// SenderKeyRecord de libsignal. Los buffers ANIDADOS (senderChainKey.seed,
// senderSigningKey.public) usan el formato Buffer.toJSON() de Node (array de
// bytes) — esa es la serialización propia de libsignal, independiente de si
// el archivo que lo contiene es .json o .cbor por fuera.
function verifySenderKey(raw: unknown): boolean {
  const decoded = extractBytes(raw)
  if (!decoded) return false

  let text: string
  try {
    text = Utf8.decode(decoded)
  } catch {
    return false
  }

  let records: any[]
  try {
    const parsed = JSON.parse(text)
    records = Array.isArray(parsed) ? parsed : [parsed]
  } catch {
    return false
  }

  for (const rec of records) {
    if (typeof rec !== 'object' || rec === null) return false

    const seed = rec.senderChainKey?.seed
    if (seed !== undefined && (!isNodeBufferJson(seed) || seed.data.length !== 32)) {
      return false
    }

    const signingPub = rec.senderSigningKey?.public
    if (
      signingPub !== undefined &&
      (!isNodeBufferJson(signingPub) || (signingPub.data.length !== 32 && signingPub.data.length !== 33))
    ) {
      return false
    }
  }

  return true
}

// ─── Verificar sender-key-memory-*.json ──────────────────────────────────────
// Distinto de sender-key-*.json: es un mapa plano { participantId: boolean }
// que Baileys usa para rastrear a quién ya le mandó la sender key del grupo.
// NO es un BaileysBuffer — validarlo con verifySenderKey() borraría archivos
// válidos (confirmado inspeccionando los archivos reales en auth/).
function verifySenderKeyMemory(raw: Record<string, any>): boolean {
  if (typeof raw !== 'object' || raw === null) return false
  return Object.values(raw).every(v => typeof v === 'boolean')
}

// ─── Verificar session-*.json ─────────────────────────────────────────────────
// Forma real (libsignal-node): { _sessions: { [baseKeyB64]: SessionEntry }, version }.
// Las claves dentro de cada SessionEntry son strings base64 planos (33 bytes para
// claves públicas con el byte de tipo DJB, 32 bytes para privadas/root/chain keys).
function verifySession(raw: Record<string, any>): boolean {
  if (typeof raw !== 'object' || raw === null) return false
  if (typeof raw._sessions !== 'object' || raw._sessions === null) return false

  for (const entry of Object.values(raw._sessions) as any[]) {
    if (typeof entry !== 'object' || entry === null) return false

    if (!isValidB64Field(entry.currentRatchet?.ephemeralKeyPair?.pubKey, [32, 33])) return false
    if (!isValidB64Field(entry.currentRatchet?.ephemeralKeyPair?.privKey, [32])) return false
    if (!isValidB64Field(entry.currentRatchet?.lastRemoteEphemeralKey, [32, 33])) return false
    if (!isValidB64Field(entry.currentRatchet?.rootKey, [32])) return false
    if (!isValidB64Field(entry.indexInfo?.baseKey, [32, 33])) return false
    if (!isValidB64Field(entry.indexInfo?.remoteIdentityKey, [32, 33])) return false

    const chains = entry._chains
    if (chains !== undefined) {
      if (typeof chains !== 'object' || chains === null) return false
      for (const chain of Object.values(chains) as any[]) {
        if (!isValidB64Field(chain?.chainKey?.key, [32])) return false
      }
    }
  }

  return true
}

// ─── Función principal ────────────────────────────────────────────────────────

async function verifyAuthDir(authDir: string): Promise<VerifyReport> {
  const report: VerifyReport = {
    totalFiles:  0,
    valid:       0,
    corrupted:   [],
    unparseable: [],
    deleted:     [],
    credsStatus: 'missing',
  }

  let files: string[]
  try {
    files = (await readdir(authDir)).filter(f => f.endsWith('.json') || f.endsWith('.cbor'))
  } catch {
    logger.warn(`[authVerifier] ${authDir} no existe o no es accesible`)
    return report
  }

  report.totalFiles = files.length

  for (const file of files) {
    const path      = join(authDir, file)
    const isCreds   = file === 'creds.json' || file === 'creds.cbor'
    let raw: Record<string, any>

    // ── Parsear (JSON o CBOR según extensión) ─────────────────────────────────
    // Reintento único tras una breve espera antes de dar por corrupto un
    // archivo: este verificador puede correr varias veces por hora (cada
    // reconexión), leyendo cientos de archivos cada vez — un glitch
    // transitorio de I/O (antivirus, sync de nube, lock de Windows) al leer
    // UN archivo en medio de ese barrido no significa que el archivo esté
    // realmente corrupto. Sin este reintento, ese glitch borraba una sesión
    // de Signal perfectamente válida, forzando un Bad MAC innecesario con
    // ese contacto.
    try {
      raw = await readAuthFile(path)
    } catch {
      await new Promise(r => setTimeout(r, 150))
      try {
        raw = await readAuthFile(path)
      } catch {
        report.unparseable.push(file)
        // Archivos ilegibles (truncados, corruptos) → eliminar excepto creds
        if (!isCreds) {
          await unlink(path).catch(() => {})
          report.deleted.push(file)
          logger.warn(`[authVerifier] ${file} — inválido (confirmado tras reintento) → eliminado`)
        } else {
          logger.error(`[authVerifier] ${file} — inválido → necesita re-autenticación (QR)`)
          report.credsStatus = 'corrupted'
        }
        continue
      }
    }

    // ── Verificar por tipo ────────────────────────────────────────────────────
    if (isCreds) {
      const { ok, failed } = verifyCreds(raw)
      if (ok) {
        report.credsStatus = 'ok'
        report.valid++
        logger.debug(`[authVerifier] ${file} — OK`)
      } else {
        report.corrupted.push(file)
        for (const f of failed) {
          logger.warn(`[authVerifier] ${file} → ${f}`)
        }
        // Intentar restaurar desde Rust antes de rendirse y pedir QR
        const restored = await _restoreCredsFromRust(path)
        if (restored) {
          report.credsStatus = 'ok'
          report.valid++
          logger.info(`[authVerifier] ${file} restaurado desde Rust (${restored}) — sin QR necesario`)
        } else {
          report.credsStatus = 'corrupted'
          logger.error(`[authVerifier] ${file} corrupto y sin backup en Rust — borra /auth y reinicia para nuevo QR`)
        }
      }
      continue
    }

    if (file.startsWith('pre-key-')) {
      if (verifyPreKey(raw)) {
        report.valid++
      } else {
        report.corrupted.push(file)
        await unlink(path).catch(() => {})
        report.deleted.push(file)
        logger.warn(`[authVerifier] ${file} — par Curve25519 inválido → eliminado`)
      }
      continue
    }

    if (file.startsWith('sender-key-memory-')) {
      if (verifySenderKeyMemory(raw)) {
        report.valid++
      } else {
        report.corrupted.push(file)
        await unlink(path).catch(() => {})
        report.deleted.push(file)
        logger.warn(`[authVerifier] ${file} — estructura inválida → eliminado`)
      }
      continue
    }

    if (file.startsWith('sender-key-')) {
      if (verifySenderKey(raw)) {
        report.valid++
      } else {
        report.corrupted.push(file)
        await unlink(path).catch(() => {})
        report.deleted.push(file)
        logger.warn(`[authVerifier] ${file} — estructura inválida → eliminado`)
      }
      continue
    }

    if (file.startsWith('session-')) {
      if (verifySession(raw)) {
        report.valid++
      } else {
        report.corrupted.push(file)
        await unlink(path).catch(() => {})
        report.deleted.push(file)
        logger.warn(`[authVerifier] ${file} — estructura inválida → eliminado`)
      }
      continue
    }

    // Otros archivos (app-state-sync, etc.) — solo validamos JSON parseable
    report.valid++
  }

  return report
}

// ─── Restaurar creds.json desde Rust (sin QR) ────────────────────────────────
// Consulta el endpoint /sessions/backup de Rust que prueba:
//   1. archivo principal (sessions/main.json) — el más reciente
//   2. snapshots #1..10 en orden — el más cercano al fallo
// Si alguno pasa la verificación Curve25519, lo escribe en auth/creds.json.
// Devuelve la fuente usada ("current" | "snapshot #N") o null si todo falló.

async function _restoreCredsFromRust(credsPath: string): Promise<string | null> {
  try {
    const { sessionClient } = await import('@lib/session.js')
    const backup = await sessionClient.readBackup()
    if (!backup) return null

    // Verificar que el backup que devuelve Rust también pasa la validación Curve25519
    const { ok } = verifyCreds(backup.creds as Record<string, any>)
    if (!ok) {
      logger.warn('[authVerifier] backup de Rust existe pero tampoco pasa verificación Curve25519')
      return null
    }

    // Escribir de vuelta a auth/creds.json o creds.cbor (escritura atómica vía tmp).
    // session.ts guarda el backup en Rust con JSON.stringify plano (sin
    // BufferJSON) — sus Buffers vienen como Buffer.toJSON() nativo
    // ({type:'Buffer',data:[...]}), no como Buffers reales. Si el destino es
    // .cbor hay que normalizarlos primero: si no, CBOR guardaría el
    // envoltorio literal en vez de los bytes, y Baileys recibiría un objeto
    // en lugar de un Buffer la próxima vez que arranque.
    const tmp = credsPath + '.tmp'
    if (credsPath.endsWith('.cbor')) {
      await writeFile(tmp, cborEncode(normalizeCredsBuffers(backup.creds)))
    } else {
      const content = JSON.stringify(backup.creds, null, 2)
      await writeFile(tmp, content, 'utf-8')
    }

    // rename atómico — si falla a mitad no deja creds.json/.cbor vacío
    const { rename } = await import('fs/promises')
    await rename(tmp, credsPath)

    return backup.source === 'current'
      ? 'backup actual de Rust'
      : `snapshot #${backup.index} de Rust`

  } catch (err: any) {
    logger.debug({ err: err?.message }, '[authVerifier] _restoreCredsFromRust falló')
    return null
  }
}

// ─── Helper para el arranque del bot ─────────────────────────────────────────

export async function verifyAndReport(authDir: string): Promise<void> {
  const r = await verifyAuthDir(authDir)

  const summary = `[authVerifier] ${r.totalFiles} archivos — ` +
    `${r.valid} OK, ${r.corrupted.length} corruptos, ` +
    `${r.unparseable.length} ilegibles, ${r.deleted.length} eliminados`

  if (r.corrupted.length === 0 && r.unparseable.length === 0) {
    logger.info(summary)
  } else {
    logger.warn(summary)
  }

  if (r.credsStatus === 'corrupted') {
    logger.error('[authVerifier] ACCIÓN REQUERIDA: creds.json sin backup recuperable — borra /auth y reinicia')
  }
}
