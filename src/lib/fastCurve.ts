// Verificar las firmas de los mensajes de grupo con el Ed25519 de OpenSSL.
//
// Cada mensaje que llega a un grupo trae una firma (sender keys de Signal, en
// Baileys: Signal/Group/sender-key-message.js), y libsignal la verificaba con
// `curve25519-js`, curva elíptica en JavaScript puro, en el hilo de Node:
// medido, 8,4 ms por mensaje. Con 100 mensajes por segundo entre todos los
// grupos, 840 ms de CPU por segundo solo en eso.
//
// La firma es la variante de XEdDSA de Signal: la clave de Curve25519 se
// lleva a Ed25519 —y = (u - 1) / (u + 1)— con el bit de signo guardado en el
// último byte de la firma, y lo demás es Ed25519 normal. Así que acá:
//
// - la clave de cada remitente se convierte UNA vez (en caché: la clave de
//   firma de un remitente en un grupo es siempre la misma), con BigInt;
// - y verifica el Ed25519 de OpenSSL que trae Node, en código nativo.
//
// OpenSSL es más estricto que tweetnacl —de donde viene curve25519-js—: lo
// que acepta, tweetnacl también lo aceptaría. Si rechaza, decide la función
// de siempre, así que se aceptan y rechazan exactamente las mismas firmas (una
// maleable, con S + L, que tweetnacl acepta, también: ver el test). Una firma
// legítima nunca llega a la función de siempre.
//
// Firmar no cambia. OpenSSL no firma con una clave de Curve25519, y escribir
// la firma a mano con BigInt no sería de tiempo constante: el tiempo podría
// filtrar bits de la clave del bot. Y no hace falta: el antiban deja salir
// como mucho 40 mensajes por minuto, ~340 ms de CPU por minuto.
//
// Se instala reemplazando `verifySignature` en `libsignal/src/curve.js`, que
// es lo que importan Baileys y libsignal, ANTES de que se cargue Baileys: por
// eso es el segundo import de index.ts. Con WINSI_CURVE_JS=1 no se toca nada.

import { createPublicKey, verify as verificarEd25519, type KeyObject } from 'node:crypto'
import { createRequire } from 'node:module'

type Verificar = (pubKey: Buffer, msg: Uint8Array, sig: Uint8Array, isInit?: boolean) => boolean

const P = 2n ** 255n - 19n

/** El prefijo DER de una clave pública Ed25519 (SPKI) de 32 bytes. */
const PREFIJO_ED25519 = Buffer.from('302a300506032b6570032100', 'hex')

/** Little-endian, sin el bit 255, como `unpack25519` de tweetnacl. */
function aNumero(b: Uint8Array): bigint {
  let n = 0n
  for (let i = 31; i >= 0; i--) n = (n << 8n) | BigInt(i === 31 ? (b[i] ?? 0) & 0x7f : (b[i] ?? 0))
  return n
}

function aBytes(n: bigint): Buffer {
  const b = Buffer.alloc(32)
  for (let i = 0; i < 32; i++) {
    b[i] = Number(n & 0xffn)
    n >>= 8n
  }
  return b
}

/** x^(p-2) mod p: el inverso, y 0 para el 0, como `inv25519` de tweetnacl. */
function inverso(x: bigint): bigint {
  let r = 1n
  let base = x % P
  let e = P - 2n
  while (e > 0n) {
    if (e & 1n) r = (r * base) % P
    base = (base * base) % P
    e >>= 1n
  }
  return r
}

/** La clave de Curve25519 como clave de Ed25519 (sin el bit de signo). */
export function edwardsDe(u: Uint8Array): Buffer {
  const x = aNumero(u)
  return aBytes((((x - 1n + P) % P) * inverso(x + 1n)) % P)
}

/** La clave de firma de cada remitente, ya en Ed25519 y como KeyObject. */
const claves = new Map<string, KeyObject | null>()
const MAX_CLAVES = 4096

function claveEd25519(pub: Uint8Array, signo: number): KeyObject | null {
  const id = Buffer.from(pub).toString('latin1') + String.fromCharCode(signo)
  const ya = claves.get(id)
  if (ya !== undefined) return ya
  const ed = edwardsDe(pub)
  ed[31] = (ed[31] ?? 0) | signo
  let k: KeyObject | null
  try {
    k = createPublicKey({ key: Buffer.concat([PREFIJO_ED25519, ed]), format: 'der', type: 'spki' })
  } catch {
    k = null
  }
  if (claves.size >= MAX_CLAVES) {
    const primera = claves.keys().next().value
    if (primera !== undefined) claves.delete(primera)
  }
  claves.set(id, k)
  return k
}

/**
 * true si OpenSSL acepta la firma; null si no, y entonces decide la función
 * de siempre. `pub` es la clave de Curve25519 de 32 bytes.
 */
export function verificar(pub: Uint8Array, mensaje: Uint8Array, firma: Uint8Array): true | null {
  if (pub.length !== 32 || firma.length !== 64) return null
  const signo = (firma[63] ?? 0) & 128
  const clave = claveEd25519(pub, signo)
  if (!clave) return null
  const sinSigno = Buffer.from(firma)
  sinSigno[63] = (sinSigno[63] ?? 0) & 127
  try {
    return verificarEd25519(null, mensaje, clave, sinSigno) ? true : null
  } catch {
    return null
  }
}

/** Reemplaza `verifySignature` de libsignal. Devuelve si quedó instalado. */
export function instalar(): boolean {
  if (process.env.WINSI_CURVE_JS === '1') return false
  const curve = createRequire(import.meta.url)('libsignal/src/curve.js') as {
    verifySignature: Verificar
    __winsi?: boolean
  }
  if (curve.__winsi) return true
  const verificarJs = curve.verifySignature
  curve.verifySignature = (pubKey, msg, sig, isInit) => {
    // Clave de 33 bytes con el prefijo 5, como la espera libsignal; lo demás
    // (validaciones, avisos, isInit) lo hace la de siempre.
    if (isInit || !(pubKey instanceof Buffer) || pubKey.byteLength !== 33 || pubKey[0] !== 5 || !msg || !sig) {
      return verificarJs(pubKey, msg, sig, isInit)
    }
    return verificar(pubKey.subarray(1), msg, sig) ?? verificarJs(pubKey, msg, sig, isInit)
  }
  curve.__winsi = true
  return true
}

instalar()
