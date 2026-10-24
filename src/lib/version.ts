// La versión del bot, de package.json. Se lee una vez: no cambia mientras el
// proceso corre. Había tres copias que lo leían del disco en cada llamada.

import { readFileSync } from 'fs'
import { join } from 'path'

let version: string | null = null

export function versionDelBot(): string {
  if (version === null) {
    try {
      version = String(JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')).version ?? '?')
    } catch {
      version = '?'
    }
  }
  return version
}
