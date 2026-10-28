// Cuándo y cómo arranca el bot a Cosxamix, el runtime de IA propio.
//
// Lógica pura, sin alias `@` ni procesos: la usa `ensureCosxamix()` de
// index.ts, y se prueba desde scripts/cosxamixLaunch.test.js sin arrancar el
// bot (arrancarlo conecta a WhatsApp).
//
// Cosxamix habla el dialecto de Ollama y el que le habla es la Session API
// (crates/session-api/src/ai_chat.rs), con OLLAMA_URL y OLLAMA_MODEL del .env.
// Lo único que hace el bot es tenerlo corriendo: lanzarlo si el .env apunta a
// él, reiniciarlo si se cae o se cuelga, y apagarlo con el resto.
//
// Mientras carga el modelo (~45 s el 3B) Cosxamix todavía no abrió el puerto,
// así que la Session API ve que no responde y sigue con el resto de la
// cascada (GPT, Gemini, Claude, las plantillas): no hay que hacer nada para
// eso.

import { existsSync } from 'fs'
import { join } from 'path'

export const PUERTO_COSXAMIX = '11435'
/** Lo que se usa si el .env no dice nada: desde la 9.0.0, Cosxamix con el 3B. */
export const URL_POR_DEFECTO = `http://127.0.0.1:${PUERTO_COSXAMIX}`
export const MODELO_POR_DEFECTO = 'qwen2.5-3b-instruct-q3_k_m'
const LOCALES = new Set(['localhost', '127.0.0.1', '[::1]'])

/** Qué pide el .env, si apunta a un Cosxamix en esta máquina. */
export interface Pedido {
  puerto: string
  modelo: string
}

/**
 * Si la IA local es un Cosxamix en esta máquina: el puerto 11435. Sin
 * `OLLAMA_URL` en el .env, sí —es lo de por defecto desde la 9.0.0—. A otra
 * máquina no se arranca nada —ese Cosxamix es de otro—, y al 11434 es Ollama.
 */
export function pedido(env: Record<string, string | undefined>): Pedido | null {
  const url = env.OLLAMA_URL?.trim() || URL_POR_DEFECTO
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return null
  }
  if (!LOCALES.has(u.hostname) || u.port !== PUERTO_COSXAMIX) return null
  return { puerto: u.port, modelo: env.OLLAMA_MODEL?.trim() || MODELO_POR_DEFECTO }
}

/** Donde viven sus cosas: el binario en bin/, los modelos y el log en data/. */
export function rutas(root: string, windows = process.platform === 'win32') {
  const home = join(root, 'data', 'cosxamix')
  return {
    binario: join(root, 'bin', windows ? 'cosxamix.exe' : 'cosxamix'),
    home,
    modelos: join(home, 'modelos'),
    log: join(home, 'cosxamix.log'),
  }
}

export type Plan =
  | { arrancar: true; entorno: Record<string, string> }
  | { arrancar: false; motivo: string }

/**
 * Qué hacer al arrancar el bot. No arranca si falta algo, y dice qué hacer.
 *
 * Sin modelo **no** se lanza, aunque Cosxamix arrancaría igual: sin modelos
 * levanta su motor de prueba, que contesta texto fijo, y el bot respondería
 * eso a la gente. Tampoco si `OLLAMA_MODEL` nombra un modelo que no está: la
 * Session API se lo pediría por nombre en cada mensaje y cada uno fallaría.
 */
export function planear(
  env: Record<string, string | undefined>,
  root: string,
  existe: (ruta: string) => boolean = existsSync,
): Plan {
  const p = pedido(env)
  if (!p) return { arrancar: false, motivo: 'el .env no apunta a Cosxamix' }
  const r = rutas(root)
  if (!existe(r.binario)) return { arrancar: false, motivo: 'falta el binario: npm run cosxamix:fetch' }
  if (!existe(join(r.modelos, `${p.modelo}.gguf`)) || !existe(join(r.modelos, 'tokenizer.json'))) {
    return { arrancar: false, motivo: `falta el modelo ${p.modelo}: npm run cosxamix:model` }
  }
  return {
    arrancar: true,
    entorno: {
      COSXAMIX_PORT: p.puerto,
      COSXAMIX_MODELOS: r.modelos,
      // El que se precalienta: el mismo que va a pedir la Session API.
      COSXAMIX_GGUF: `${p.modelo}.gguf`,
    },
  }
}

/**
 * Si se lo vuelve a levantar después de una caída: hasta 5 en 10 minutos. Más
 * que eso es que algo está roto —un modelo dañado, poca memoria— y
 * relanzarlo cada pocos segundos solo gasta CPU y llena el log.
 */
export function reintentar(caidas: number[], ahora: number, max = 5, ventanaMs = 10 * 60_000): boolean {
  return caidas.filter((t) => ahora - t < ventanaMs).length < max
}

/** Cuántos chequeos de salud seguidos sin respuesta lo dan por colgado. */
export const FALLOS_PARA_COLGADO = 3
