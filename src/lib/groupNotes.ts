// Las notas de cada grupo (#nota): textos con nombre que los admins guardan y
// cualquiera lee —reglas, cómo pagar, horarios, el stock de una tienda—.
//
// Reemplaza a los ~20 comandos de "tienda" de otros bots (setpago/pago,
// setstock/stock, setreglas/reglas, setpromo/promo…), que eran todos el mismo
// comando con otro nombre: guardar un texto y mostrarlo.

import { enData, leerJson, guardarJson, esObjeto } from '@lib/jsonFile.js'

export const MAX_NOTAS = 50
export const MAX_TEXTO = 3000

export interface Nota { texto: string; por: string; en: number }

const ARCHIVO = enData('notes.json')
let notas: Record<string, Record<string, Nota>> = leerJson(ARCHIVO, {}, esObjeto)

/** "Reglas del Grupo" → "reglas-del-grupo"; null si queda vacío o es muy largo. */
export function nombreDeNota(crudo: string): string | null {
  const n = crudo.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9ñ_-]+/g, '-').replace(/^-+|-+$/g, '')
  return n && n.length <= 30 ? n : null
}

export const notasDe = (gjid: string) => notas[gjid] ?? {}

export function leerNota(gjid: string, nombre: string): Nota | null {
  return notas[gjid]?.[nombre] ?? null
}

export type Guardado = 'ok' | 'llenas' | 'larga'

export function guardarNota(gjid: string, nombre: string, texto: string, por: string): Guardado {
  if (texto.length > MAX_TEXTO) return 'larga'
  const g = (notas[gjid] ??= {})
  if (!g[nombre] && Object.keys(g).length >= MAX_NOTAS) return 'llenas'
  g[nombre] = { texto, por, en: Date.now() }
  guardarJson(ARCHIVO, notas)
  return 'ok'
}

export function borrarNota(gjid: string, nombre: string): boolean {
  if (!notas[gjid]?.[nombre]) return false
  delete notas[gjid][nombre]
  if (!Object.keys(notas[gjid]).length) delete notas[gjid]
  guardarJson(ARCHIVO, notas)
  return true
}
