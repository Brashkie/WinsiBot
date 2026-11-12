// La sesión de WhatsApp, sellada en el disco.
//
// Con los archivos de auth/ se ES el bot: quien los copie —un respaldo, una
// carpeta compartida, el almacenamiento de Termux— entra a WhatsApp como él,
// sin QR. Desde la 9.5 cada archivo se guarda SELLADO: cifrado y autenticado
// con ChaCha20-Poly1305 (RFC 8439), con la clave que custodia la Session API
// (crates/session-api/src/vault.rs: en Windows, protegida con DPAPI).
//
// El formato es el mismo que el de la Session API (src/seal.rs), que sella con
// SPARKNaCl —en SPARK, demostrado—: lo que sella uno lo abre el otro, y los
// tests lo comprueban con vectores en los dos sentidos.
//
//   "WSB1" | nonce (12) | etiqueta (16) | cifrado
//
// Los datos asociados son el nombre del archivo (`winsibot:auth:creds.cbor`),
// así que un archivo puesto en el lugar de otro no se abre. Acá cifra
// `chacha20-poly1305` de Node (OpenSSL, viene con Node): cada escritura de una
// clave de Signal es local, sin un viaje a la Session API, y la sesión se
// sigue guardando aunque la Session API se reinicie.
//
// Lo que importa de verdad: NUNCA confundir "no tengo la clave" con "el
// archivo está roto". Un archivo roto se borra o se recupera del .bak; uno que
// no se puede abrir porque falta la clave, o porque es otra, no se toca.

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

export const MARCA = Buffer.from('WSB1', 'latin1')
const CABECERA = 4 + 12 + 16

export type MotivoSello = 'sin-clave' | 'no-coincide' | 'largo'

/** Por qué no se pudo abrir un archivo sellado. */
export class ErrorSello extends Error {
  constructor(readonly motivo: MotivoSello, message: string) {
    super(message)
    this.name = 'ErrorSello'
  }
}

/** Si los bytes empiezan como un archivo sellado. */
export function estaSellado(b: Uint8Array): boolean {
  return b.length >= CABECERA && MARCA.equals(Buffer.from(b.buffer, b.byteOffset, 4))
}

/** Los datos asociados de un archivo de auth/: su nombre lógico. */
export function aadAuth(nombre: string): Buffer {
  return Buffer.from(`winsibot:auth:${nombre}`, 'utf8')
}

/** El nombre lógico: el del archivo sin `.bak` —la copia de creds se abre como creds—. */
export function nombreLogico(archivo: string): string {
  return archivo.replace(/\.bak$/, '')
}

/** Sella `datos`. El nonce es al azar; pasarlo es solo para los vectores. */
export function sellar(clave: Buffer, aad: Buffer, datos: Uint8Array, nonce: Buffer = randomBytes(12)): Buffer {
  if (clave.length !== 32) throw new ErrorSello('largo', 'la clave tiene que medir 32 bytes')
  if (datos.length === 0 || aad.length === 0 || aad.length > 256) {
    throw new ErrorSello('largo', 'datos vacíos o datos asociados fuera de rango')
  }
  const c = createCipheriv('chacha20-poly1305', clave, nonce, { authTagLength: 16 })
  c.setAAD(aad, { plaintextLength: datos.length })
  const cifrado = Buffer.concat([c.update(datos), c.final()])
  return Buffer.concat([MARCA, nonce, c.getAuthTag(), cifrado])
}

/** Abre lo que selló `sellar` (o la Session API). Lanza `ErrorSello`. */
export function abrir(clave: Buffer, aad: Buffer, sellado: Uint8Array): Buffer {
  if (!estaSellado(sellado)) throw new ErrorSello('largo', 'no está sellado')
  const b = Buffer.from(sellado.buffer, sellado.byteOffset, sellado.length)
  const nonce = b.subarray(4, 16)
  const etiqueta = b.subarray(16, 32)
  const cifrado = b.subarray(CABECERA)
  if (cifrado.length === 0) throw new ErrorSello('largo', 'sellado vacío')
  try {
    const d = createDecipheriv('chacha20-poly1305', clave, nonce, { authTagLength: 16 })
    d.setAAD(aad, { plaintextLength: cifrado.length })
    d.setAuthTag(etiqueta)
    return Buffer.concat([d.update(cifrado), d.final()])
  } catch {
    throw new ErrorSello('no-coincide', 'la etiqueta no coincide (otra clave, otro nombre o un byte cambiado)')
  }
}

/**
 * Los bytes de un archivo de auth/ en claro: si está sellado lo abre con la
 * clave, y si no, lo devuelve como está (los de antes de la 9.5, hasta que se
 * migran). Sellado y sin clave lanza `ErrorSello('sin-clave')`.
 */
export function abrirArchivo(clave: Buffer | null, archivo: string, b: Uint8Array): Buffer {
  if (!estaSellado(b)) return Buffer.from(b.buffer, b.byteOffset, b.length)
  if (!clave) throw new ErrorSello('sin-clave', `${archivo} está sellado y no hay clave`)
  return abrir(clave, aadAuth(nombreLogico(archivo)), b)
}

/** Lo que se escribe: sellado si hay clave, en claro si no. */
export function guardarArchivo(clave: Buffer | null, archivo: string, datos: Uint8Array): Uint8Array {
  return clave ? sellar(clave, aadAuth(nombreLogico(archivo)), datos) : datos
}

// ─── La clave, de la Session API ──────────────────────────────────────────────

let pedida: Promise<Buffer | null> | null = null

/**
 * La clave de auth/, que custodia la Session API (`GET /vault/auth`). Se pide
 * una vez y queda en memoria. null si la Session API no la dio en ~20 s: el
 * bot sigue, y auth/ queda como esté (ver authStateCbor.ts).
 */
export function claveAuth(): Promise<Buffer | null> {
  pedida ??= (async () => {
    const { rustRequest } = await import('./rustHttp.js')
    const { logger } = await import('@core/logger.js')
    let ultimo = ''
    for (let intento = 0; intento < 10; intento++) {
      try {
        const r = await rustRequest<{ ok: boolean; key?: string; error?: string }>(
          'GET', '/vault/auth', undefined, { timeout: 2_000 })
        if (r.status === 200 && r.data?.ok && r.data.key) {
          const k = Buffer.from(r.data.key, 'base64')
          if (k.length === 32) return k
          ultimo = `clave de ${k.length} bytes`
        } else {
          // La Session API contestó que no tiene la clave (vault.key que no
          // abre): no tiene sentido seguir preguntando.
          ultimo = r.data?.error ?? `HTTP ${r.status}`
          if (r.status === 503) break
        }
      } catch (e: any) {
        ultimo = e?.message ?? String(e)
      }
      await new Promise(r => setTimeout(r, 2_000))
    }
    logger.warn(`[auth] sin la clave de la sesión (${ultimo}): auth/ no se sella`)
    pedida = null // que la próxima vez se vuelva a pedir
    return null
  })()
  return pedida
}
