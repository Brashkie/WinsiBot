// Lo que ya se subió a WhatsApp, para no subirlo otra vez.
//
// Cada foto o video que sale se sube a los servidores de WhatsApp. Los del bot
// son siempre los mismos —WinsiBot.png en cada bienvenida y en #ping, uno de
// los menu*.mp4 en cada #menu—, y se subían enteros cada vez: 1,8 MB la imagen
// y hasta 9,6 MB un video, en cada envío. En un teléfono o con mala conexión
// eso son segundos.
//
// Baileys ya sabe reusar una subida (`mediaCache`, ver prepareWAMessageMedia):
// guarda el mensaje ya subido —con su url, su clave, su miniatura— y la próxima
// vez lo manda sin subir nada. Solo funciona si el medio se pasa por ruta
// (`{ url }`) y no como Buffer, que es lo que hace media_sender.ts.
//
// Uno por socket: cada sub-bot es otra cuenta, y no reusa lo que subió otra.
//
// Una hora: WhatsApp no publica cuánto vive una subida en sus servidores, y es
// lo que usan los ejemplos de Baileys. Pasada la hora se sube de nuevo, una vez.

import type { CacheStore } from '@whiskeysockets/baileys'
import { Cache } from './cacheManager.js'

const UNA_HORA = 60 * 60_000

/** Un caché de subidas nuevo, para pasarle a `makeWASocket` y a `recordar`. */
export function nuevoMediaCache(): CacheStore {
  const subidas = new Cache<unknown>({ ttl: UNA_HORA, maxSize: 64 })
  return {
    get: <T>(key: string) => subidas.get(key) as T | undefined,
    set: <T>(key: string, value: T) => subidas.set(key, value),
    del: (key: string) => {
      subidas.delete(key)
    },
    flushAll: () => subidas.clear(),
  }
}

const porSocket = new WeakMap<object, CacheStore>()

/** Anota el caché de un socket, para quien prepara medios a mano (#menu). */
export function recordar(sock: object, cache: CacheStore): void {
  porSocket.set(sock, cache)
}

/** El caché de subidas del socket, si tiene. */
export function mediaCacheDe(sock: object | undefined): CacheStore | undefined {
  return sock ? porSocket.get(sock) : undefined
}
