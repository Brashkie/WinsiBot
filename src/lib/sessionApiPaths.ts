// Dónde está el binario de la Session API y desde qué carpeta corre.
//
// Separado de index.ts para poder probarlo sin arrancar el bot: arrancarlo
// conecta a WhatsApp, y con la cuenta de producción eso expulsa a la instancia
// que esté corriendo en otro lado (440).

import { existsSync, mkdirSync, renameSync, statSync } from 'fs'
import { join } from 'path'
import { logger } from '@core/logger.js'
import { binPath, exeName } from '@lib/platform.js'

export const SESSION_API = 'winsibot-session-api'

/**
 * El binario de la Session API, donde esté: el que baja `npm install` a bin/,
 * el que deja `cargo build` en target/ del workspace, o el de la carpeta rust/
 * de antes de la 8.15.0, para quien actualizó el código pero todavía no bajó
 * ni compiló el binario nuevo.
 */
export function sessionApiBinary(): string | null {
  const root = process.cwd()
  const candidates = [
    binPath(SESSION_API),
    join(root, 'target', 'release', exeName(SESSION_API)),
    join(root, 'rust', 'target', 'release', exeName(SESSION_API)),
  ].filter(existsSync)
  // El más nuevo: si compilaste después de bajar, el tuyo; si bajaste una
  // release después de compilar, esa.
  candidates.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)
  return candidates[0] ?? null
}

/**
 * La carpeta de trabajo de la Session API: data/session-api/.
 *
 * Hasta la 8.14.0 la API corría con la carpeta del CÓDIGO como directorio de
 * trabajo, rust/, así que sus datos —messages.db, la base de conversaciones que
 * aprendió la IA, las copias de creds en sessions/, antiban.json, sus logs y su
 * .env— vivían mezclados con el código y atados a su nombre. Renombrar la
 * carpeta los habría dejado atrás, y la API habría arrancado vacía.
 *
 * Ahora viven bajo data/, como el resto del estado del bot, y lo que quedó en
 * rust/ se mueve acá UNA vez, sin pisar nada que ya exista.
 */
export function sessionApiHome(): string {
  const root = process.cwd()
  const home = join(root, 'data', 'session-api')
  mkdirSync(home, { recursive: true })

  const legacy = join(root, 'rust')
  for (const name of ['data', 'sessions', 'logs', '.env']) {
    const from = join(legacy, name)
    const to   = join(home, name)
    if (!existsSync(from) || existsSync(to)) continue
    try {
      renameSync(from, to)
      logger.info(`Session API: rust/${name} movido a data/session-api/${name}`)
    } catch (err) {
      // Si no se pudo mover (otro proceso lo tiene abierto, otro disco), se
      // avisa y se sigue: la API arranca, y el aviso dice qué mover a mano.
      logger.warn({ err }, `Session API: no se pudo mover rust/${name} — movelo a mano a data/session-api/${name}`)
    }
  }
  return home
}
