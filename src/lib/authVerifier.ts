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
 *   - creds.json — si está corrupto el bot necesita QR nuevo (se reporta pero no se borra)
 *   - Archivos de app-state-sync (solo se validan como JSON)
 */

import { readdir, readFile, writeFile, unlink } from 'fs/promises'
import { join } from 'path'
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

// Decodificación estricta: signalis-core Base64.decode() lanza en base64
// malformado (caracteres inválidos, padding incorrecto), a diferencia de
// Buffer.from(str, 'base64') que ignora silenciosamente los bytes corruptos.
function decodeBuffer(bb: BaileysBuffer): Buffer {
  return Base64.decode(bb.data)
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
function verifyKeyPair(priv: BaileysBuffer, pub: BaileysBuffer): boolean {
  try {
    const privBuf = decodeBuffer(priv)
    const pubBuf  = decodeBuffer(pub)

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
    private: BaileysBuffer | undefined
    public:  BaileysBuffer | undefined
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
    if (!isBaileysBuffer(field.private) || !isBaileysBuffer(field.public)) {
      failed.push(`${field.path} — estructura inválida (no es BaileysBuffer)`)
      continue
    }
    if (!verifyKeyPair(field.private, field.public)) {
      failed.push(`${field.path} — publicFromPrivate no coincide (corrupto)`)
    }
  }

  // signedPreKey signature debe existir y tener 64 bytes
  if (isBaileysBuffer(raw.signedPreKey?.signature)) {
    try {
      const sig = decodeBuffer(raw.signedPreKey.signature)
      if (sig.length !== 64) {
        failed.push(`signedPreKey.signature — tamaño inválido (${sig.length} bytes, esperado 64)`)
      }
    } catch {
      failed.push('signedPreKey.signature — base64 inválido (corrupto)')
    }
  } else {
    failed.push('signedPreKey.signature — falta o inválido')
  }

  return { ok: failed.length === 0, failed }
}

// ─── Verificar pre-key-N.json ─────────────────────────────────────────────────
function verifyPreKey(raw: Record<string, any>): boolean {
  if (!isBaileysBuffer(raw.private) || !isBaileysBuffer(raw.public)) return false
  return verifyKeyPair(raw.private, raw.public)
}

// ─── Verificar sender-key-*.json ──────────────────────────────────────────────
// El archivo completo es un BaileysBuffer (base64) que al decodificarse da un
// string UTF-8 con un array JSON de estados SenderKeyRecord de libsignal. Los
// buffers ANIDADOS (senderChainKey.seed, senderSigningKey.public) usan el
// formato Buffer.toJSON() de Node (array de bytes), no base64.
function verifySenderKey(raw: Record<string, any>): boolean {
  if (!isBaileysBuffer(raw)) return false

  let decoded: Buffer
  try {
    decoded = Base64.decode(raw.data)
  } catch {
    return false
  }

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

export async function verifyAuthDir(authDir: string): Promise<VerifyReport> {
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
    files = (await readdir(authDir)).filter(f => f.endsWith('.json'))
  } catch {
    logger.warn(`[authVerifier] ${authDir} no existe o no es accesible`)
    return report
  }

  report.totalFiles = files.length

  for (const file of files) {
    const path = join(authDir, file)
    let raw: Record<string, any>

    // ── Parsear JSON ──────────────────────────────────────────────────────────
    // Reintento único tras una breve espera antes de dar por corrupto un
    // archivo: este verificador puede correr varias veces por hora (cada
    // reconexión), leyendo cientos de archivos cada vez — un glitch
    // transitorio de I/O (antivirus, sync de nube, lock de Windows) al leer
    // UN archivo en medio de ese barrido no significa que el archivo esté
    // realmente corrupto. Sin este reintento, ese glitch borraba una sesión
    // de Signal perfectamente válida, forzando un Bad MAC innecesario con
    // ese contacto.
    try {
      const content = await readFile(path, 'utf-8')
      raw = JSON.parse(content)
    } catch {
      await new Promise(r => setTimeout(r, 150))
      try {
        const content = await readFile(path, 'utf-8')
        raw = JSON.parse(content)
      } catch {
        report.unparseable.push(file)
        // Archivos con JSON inválido (truncado, corrupto) → eliminar excepto creds
        if (file !== 'creds.json') {
          await unlink(path).catch(() => {})
          report.deleted.push(file)
          logger.warn(`[authVerifier] ${file} — JSON inválido (confirmado tras reintento) → eliminado`)
        } else {
          logger.error('[authVerifier] creds.json — JSON inválido → necesita re-autenticación (QR)')
          report.credsStatus = 'corrupted'
        }
        continue
      }
    }

    // ── Verificar por tipo ────────────────────────────────────────────────────
    if (file === 'creds.json') {
      const { ok, failed } = verifyCreds(raw)
      if (ok) {
        report.credsStatus = 'ok'
        report.valid++
        logger.debug('[authVerifier] creds.json — OK')
      } else {
        report.corrupted.push(file)
        for (const f of failed) {
          logger.warn(`[authVerifier] creds.json → ${f}`)
        }
        // Intentar restaurar desde Rust antes de rendirse y pedir QR
        const restored = await _restoreCredsFromRust(path)
        if (restored) {
          report.credsStatus = 'ok'
          report.valid++
          logger.info(`[authVerifier] creds.json restaurado desde Rust (${restored}) — sin QR necesario`)
        } else {
          report.credsStatus = 'corrupted'
          logger.error('[authVerifier] creds.json corrupto y sin backup en Rust — borra /auth y reinicia para nuevo QR')
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

    // Escribir de vuelta a auth/creds.json (escritura atómica vía tmp)
    const content = JSON.stringify(backup.creds, null, 2)
    const tmp     = credsPath + '.tmp'
    await writeFile(tmp, content, 'utf-8')

    // rename atómico — si falla a mitad no deja creds.json vacío
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
    `${r.unparseable.length} JSON inválidos, ${r.deleted.length} eliminados`

  if (r.corrupted.length === 0 && r.unparseable.length === 0) {
    logger.info(summary)
  } else {
    logger.warn(summary)
  }

  if (r.credsStatus === 'corrupted') {
    logger.error('[authVerifier] ACCIÓN REQUERIDA: creds.json sin backup recuperable — borra /auth y reinicia')
  }
}
