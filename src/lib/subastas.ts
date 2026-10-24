import type { WASocket } from '@whiskeysockets/baileys'
import { logger } from '@core/logger.js'
import { getUserData, patchUserData, type OwnedDragon, type ItemInventory } from '@core/events.js'
import { sendCritical } from '@lib/media_sender.js'
import { pujaMinima, alargar, neto } from '@lib/subastaReglas.js'
import { enData, leerJson, guardarJson, esObjeto } from '@lib/archivoJson.js'
import { Despertador } from '@lib/despertador.js'

// Subastas: una a la vez por grupo, que vive en ese grupo.
//
// Todo lo que está en juego queda RETENIDO hasta que termina: el objeto sale
// del vendedor al publicarla, y cada puja sale del saldo del que puja —y se le
// devuelve al que superan—. Así, al cerrar no hay nada que cobrarle a nadie
// que ya no lo tenga. El estado vive en data/subastas.json, con el objeto y la
// puja adentro: un reinicio a mitad de una subasta no pierde ni el objeto ni
// el dinero, y al arrancar se vuelve a armar el temporizador.

const ARCHIVO = enData('subastas.json')

export type Objeto =
  | { tipo: 'dragon'; dragon: OwnedDragon }
  | { tipo: 'item'; clave: keyof Omit<ItemInventory, 'stickerPack'>; cantidad: number; nombre: string }

export interface Subasta {
  gjid:     string
  vendedor: string
  objeto:   Objeto
  base:     number
  puja:     { jid: string; monto: number } | null
  pujas:    number
  termina:  number
  creada:   number
}

let subastas: Record<string, Subasta> = leerJson(ARCHIVO, {}, esObjeto)
const despertador = new Despertador(cerrarVencidas)
let sockRef: WASocket | null = null

const guardar = () => guardarJson(ARCHIVO, subastas)

function armar(): void {
  if (!sockRef) return despertador.desarmar()
  let proxima = Infinity
  for (const s of Object.values(subastas)) if (s.termina < proxima) proxima = s.termina
  despertador.armar(proxima)
}

export function describir(o: Objeto): string {
  return o.tipo === 'dragon'
    ? `🐉 *${o.dragon.name}* (Nv.${o.dragon.level})`
    : `${o.cantidad}× ${o.nombre}`
}

function entregar(jid: string, o: Objeto): void {
  const u = getUserData(jid)
  if (o.tipo === 'dragon') {
    // El oro pasivo cuenta desde que llega: el tiempo en subasta no se cobra.
    patchUserData(jid, { dragons: [...u.dragons, { ...o.dragon, lastCollect: Date.now() }] })
  } else {
    patchUserData(jid, { items: { [o.clave]: (u.items[o.clave] ?? 0) + o.cantidad } })
  }
}

async function cerrar(s: Subasta): Promise<void> {
  delete subastas[s.gjid]
  let texto: string
  const mentions = [s.vendedor]
  if (s.puja) {
    entregar(s.puja.jid, s.objeto)
    const recibe = neto(s.puja.monto)
    patchUserData(s.vendedor, { money: getUserData(s.vendedor).money + recibe })
    mentions.push(s.puja.jid)
    texto = [
      `╭─「 🔨 ¡VENDIDO! 」`,
      `│`,
      `│ ${describir(s.objeto)}`,
      `│ para @${s.puja.jid.split('@')[0]} por *¥${s.puja.monto.toLocaleString()}*`,
      `│ (${s.pujas} puja${s.pujas === 1 ? '' : 's'})`,
      `│`,
      `╰─ @${s.vendedor.split('@')[0]} recibe ¥${recibe.toLocaleString()} (5% de comisión)`,
    ].join('\n')
  } else {
    entregar(s.vendedor, s.objeto)
    texto = `🔨 La subasta de ${describir(s.objeto)} terminó sin pujas. @${s.vendedor.split('@')[0]}, vuelve a tu inventario.`
  }
  guardar()
  if (sockRef) {
    // El objeto y el dinero ya se movieron: con garantía de entrega.
    await sendCritical(sockRef, s.gjid, { text: texto, mentions })
      .catch(err => logger.warn({ err, gjid: s.gjid }, 'subastas: no se pudo avisar el cierre'))
  }
}

async function cerrarVencidas(): Promise<void> {
  const ahora = Date.now()
  for (const s of Object.values(subastas)) {
    if (s.termina <= ahora) await cerrar(s)
  }
  armar()
}

// ─── Lo que usa el comando ────────────────────────────────────────────────────

export const subastaDe = (gjid: string): Subasta | null => subastas[gjid] ?? null

export function deVendedor(jid: string): Subasta | null {
  return Object.values(subastas).find(s => s.vendedor === jid) ?? null
}

/** Publica la subasta. El objeto YA tiene que haber salido del vendedor. */
export function publicar(gjid: string, vendedor: string, objeto: Objeto, base: number, minutos: number): Subasta {
  const ahora = Date.now()
  const s: Subasta = {
    gjid, vendedor, objeto, base, puja: null, pujas: 0, termina: ahora + minutos * 60_000, creada: ahora,
  }
  subastas[gjid] = s
  guardar()
  armar()
  return s
}

export type ResultadoPuja =
  | { ok: true; subasta: Subasta; superado: string | null; alargo: boolean }
  | { ok: false; motivo: 'sin-subasta' | 'es-vendedor' | 'baja' | 'sin-saldo' | 'ya-gana'; minima?: number }

export function pujar(gjid: string, jid: string, monto: number): ResultadoPuja {
  const s = subastas[gjid]
  if (!s || Date.now() >= s.termina) return { ok: false, motivo: 'sin-subasta' }
  if (s.vendedor === jid) return { ok: false, motivo: 'es-vendedor' }
  if (s.puja?.jid === jid) return { ok: false, motivo: 'ya-gana' }
  const minima = pujaMinima(s.base, s.puja?.monto ?? null)
  if (!(monto >= minima)) return { ok: false, motivo: 'baja', minima }
  const u = getUserData(jid)
  if (u.money < monto) return { ok: false, motivo: 'sin-saldo', minima }

  // Se retiene la nueva y se devuelve la anterior.
  patchUserData(jid, { money: u.money - monto })
  const superado = s.puja?.jid ?? null
  if (s.puja) patchUserData(s.puja.jid, { money: getUserData(s.puja.jid).money + s.puja.monto })

  s.puja = { jid, monto }
  s.pujas++
  const antes = s.termina
  s.termina = alargar(s.termina, Date.now())
  guardar()
  if (s.termina !== antes) armar()
  return { ok: true, subasta: s, superado, alargo: s.termina !== antes }
}

/** El vendedor la retira: solo si nadie pujó todavía. */
export function cancelar(gjid: string, jid: string): Subasta | null {
  const s = subastas[gjid]
  if (!s || s.vendedor !== jid || s.puja) return null
  delete subastas[gjid]
  entregar(jid, s.objeto)
  guardar()
  armar()
  return s
}

/** Llamar en cada 'ready': guarda el socket vivo y arma el temporizador. */
export function setupSubastas(sock: WASocket): void {
  sockRef = sock
  armar()
}
