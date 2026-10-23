// rustHttp.ts — el ÚNICO cliente HTTP del bot hacia la Session API.
//
// Hasta la 8.15.0 había tres formas de hablarle a la misma API, cada una con lo
// suyo: `axios` en nativeBridge.ts, `fetch` en session.ts y serbot.ts, y otro
// `fetch` suelto en index.ts para el latido. Medido con `npm run bench:hops`
// contra la API real, 3000 llamadas a /nlp/fast por cada uno:
//
// | cliente                     | por llamada   | CPU de Node por llamada |
// |-----------------------------|--------------:|------------------------:|
// | `fetch` (undici)            |   ~13 800 µs  |   ~2 500 µs             |
// | `axios`                     |   ~620–935 µs |   ~590–920 µs           |
// | `http` con keep-alive       |   ~210–550 µs |   ~180–430 µs           |
//
// `fetch` tardaba ~14 ms por llamada en esta máquina, y por él pasaban
// checkRate (cada mensaje), el antiban (CADA envío) y el anti-spam. `http`
// con un agente keep-alive y sin Nagle es lo más liviano que trae Node: sin
// dependencias, y con 2-3x menos CPU que axios por viaje. Lo que se ahorra es
// por mensaje, y un bot de cientos de grupos hace miles por hora.
//
// Mantiene la forma de axios que usaban los llamadores —`get`, `post`,
// `delete`, que devuelven `{ status, data }` y lanzan con `err.response` en
// un 4xx/5xx— para que el cambio no toque ninguna de sus llamadas.

import http from 'http'
import { config } from '@config'

const base = new URL(config.rustApiUrl || 'http://127.0.0.1:3001')

// Una conexión que se reutiliza: abrir TCP en cada llamada es lo más caro de
// un viaje local. 32 sockets cubren los picos de varios grupos a la vez.
const agent = new http.Agent({ keepAlive: true, keepAliveMsecs: 10_000, maxSockets: 32, maxFreeSockets: 8 })

export interface RustResponse<T> {
  status: number
  data:   T
}

export interface RustOptions {
  /** ms. Sin él, 30 s: casi todo contesta en sub-ms y el que no, fija el suyo. */
  timeout?: number
  params?:  Record<string, string | number | boolean | undefined>
  headers?: Record<string, string>
}

/** Error con la misma forma que el de axios: `err.response.status`. */
export class RustHttpError extends Error {
  constructor(
    message: string,
    readonly response?: RustResponse<unknown>,
    readonly code?: string,
  ) {
    super(message)
    this.name = 'RustHttpError'
  }
}

/**
 * Una llamada. NO lanza por el código HTTP —eso lo decide quien llama—, solo
 * cuando no hay respuesta: red, timeout, API caída.
 */
export function rustRequest<T = any>(
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  path: string,
  body?: unknown,
  opts: RustOptions = {},
): Promise<RustResponse<T>> {
  let ruta = path
  if (opts.params) {
    const q = new URLSearchParams()
    for (const [k, v] of Object.entries(opts.params)) if (v !== undefined) q.set(k, String(v))
    const s = q.toString()
    if (s) ruta += (ruta.includes('?') ? '&' : '?') + s
  }
  const payload = body === undefined ? undefined : Buffer.from(JSON.stringify(body))

  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host:    base.hostname,
        port:    base.port || 80,
        path:    ruta,
        method,
        agent,
        headers: {
          'x-api-key': config.sessionApiKey,
          ...(payload ? { 'content-type': 'application/json', 'content-length': payload.length } : {}),
          ...opts.headers,
        },
      },
      (res) => {
        const partes: Buffer[] = []
        res.on('data', (c: Buffer) => partes.push(c))
        res.on('end', () => {
          const crudo = Buffer.concat(partes)
          let data: any = null
          if (crudo.length) {
            try { data = JSON.parse(crudo.toString('utf8')) } catch { data = crudo.toString('utf8') }
          }
          resolve({ status: res.statusCode ?? 0, data })
        })
        res.on('error', reject)
      },
    )
    // Sin Nagle: los mensajes son chicos y esperar a juntar bytes solo suma
    // latencia en cada viaje.
    req.setNoDelay(true)
    req.setTimeout(opts.timeout ?? 30_000, () => {
      req.destroy(new RustHttpError(`timeout de ${opts.timeout ?? 30_000} ms en ${path}`, undefined, 'ETIMEDOUT'))
    })
    req.on('error', (e: any) => reject(e instanceof RustHttpError ? e : new RustHttpError(e?.message ?? String(e), undefined, e?.code)))
    req.end(payload)
  })
}

async function conEstado<T>(p: Promise<RustResponse<T>>, path: string): Promise<RustResponse<T>> {
  const r = await p
  if (r.status < 200 || r.status >= 300) {
    throw new RustHttpError(`HTTP ${r.status} en ${path}`, r as RustResponse<unknown>)
  }
  return r
}

/** Forma de axios: lanza en un 4xx/5xx, con `err.response`. */
export const rustHttp = {
  get:    <T = any>(path: string, opts?: RustOptions) => conEstado<T>(rustRequest<T>('GET', path, undefined, opts), path),
  post:   <T = any>(path: string, body?: unknown, opts?: RustOptions) => conEstado<T>(rustRequest<T>('POST', path, body ?? {}, opts), path),
  put:    <T = any>(path: string, body?: unknown, opts?: RustOptions) => conEstado<T>(rustRequest<T>('PUT', path, body ?? {}, opts), path),
  delete: <T = any>(path: string, opts?: RustOptions) => conEstado<T>(rustRequest<T>('DELETE', path, undefined, opts), path),
}
