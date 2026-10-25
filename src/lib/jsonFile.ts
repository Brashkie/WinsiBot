// Leer y guardar un JSON de data/ sin que un corte lo deje a medias.
//
// Guardar es escribir aparte y renombrar: el rename reemplaza el archivo de
// una vez, así que quien lee ve el viejo o el nuevo, nunca uno cortado. Un
// writeFileSync directo, cortado a la mitad, deja un JSON roto, y el próximo
// arranque lo lee como "no hay nada": en el portafolio de #comprar eso era
// perder las posiciones de todos.
//
// Antes cada módulo tenía su copia de esto (recordatorios, subastas, raid,
// mazmorra, apuestas abiertas) y otros dos escribían sin protección
// (cumpleaños y portafolio).

import { readFileSync, writeFileSync, mkdirSync, renameSync } from 'fs'
import { dirname, join } from 'path'
import { logger } from '@core/logger.js'

/** La ruta de un archivo de data/. */
export const enData = (nombre: string) => join(process.cwd(), 'data', nombre)

/**
 * El contenido, o `porDefecto` si no existe, no se puede leer o `valido` lo
 * rechaza (un archivo de otra versión, o editado a mano).
 */
export function leerJson<T>(ruta: string, porDefecto: T, valido: (v: unknown) => boolean = () => true): T {
  try {
    const v = JSON.parse(readFileSync(ruta, 'utf-8'))
    return valido(v) ? (v as T) : porDefecto
  } catch {
    return porDefecto
  }
}

/** Guarda de una vez. Un error se anota y no corta a quien llama. */
export function guardarJson(ruta: string, datos: unknown): boolean {
  try {
    mkdirSync(dirname(ruta), { recursive: true })
    const tmp = `${ruta}.tmp`
    writeFileSync(tmp, JSON.stringify(datos))
    renameSync(tmp, ruta)
    return true
  } catch (err) {
    logger.warn({ err, ruta }, 'no se pudo guardar')
    return false
  }
}

export const esObjeto = (v: unknown) => !!v && typeof v === 'object' && !Array.isArray(v)
