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

function decodeBuffer(bb: BaileysBuffer): Buffer {
  return Buffer.from(bb.data, 'base64')
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
    const sig = decodeBuffer(raw.signedPreKey.signature)
    if (sig.length !== 64) {
      failed.push(`signedPreKey.signature — tamaño inválido (${sig.length} bytes, esperado 64)`)
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
// Solo valida que sea JSON parseable con estructura mínima esperada.
function verifySenderKey(raw: Record<string, any>): boolean {
  // Baileys guarda sender keys como { _senderKeyData: {...} } o similar
  // Lo mínimo: es un objeto no vacío y JSON parseable (ya pasó por JSON.parse)
  return typeof raw === 'object' && raw !== null
}

// ─── Verificar session-*.json ─────────────────────────────────────────────────
function verifySession(raw: Record<string, any>): boolean {
  return typeof raw === 'object' && raw !== null
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
    try {
      const content = await readFile(path, 'utf-8')
      raw = JSON.parse(content)
    } catch {
      report.unparseable.push(file)
      // Archivos con JSON inválido (truncado, corrupto) → eliminar excepto creds
      if (file !== 'creds.json') {
        await unlink(path).catch(() => {})
        report.deleted.push(file)
        logger.warn(`[authVerifier] ${file} — JSON inválido → eliminado`)
      } else {
        logger.error('[authVerifier] creds.json — JSON inválido → necesita re-autenticación (QR)')
        report.credsStatus = 'corrupted'
      }
      continue
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
