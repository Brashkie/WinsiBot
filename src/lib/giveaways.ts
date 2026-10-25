import type { WASocket } from '@whiskeysockets/baileys'
import { logger } from '@core/logger.js'
import { safeSend } from '@lib/media_sender.js'
import { enData, leerJson, guardarJson, esObjeto } from '@lib/jsonFile.js'
import { Despertador } from '@lib/wakeTimer.js'
import { elegirGanadores } from '@lib/raffle.js'

// Los sorteos con inscripción (#sorteo): uno por grupo, guardado en
// data/giveaways.json para que un reinicio no se lleve a los anotados, y UN
// temporizador para el próximo que cierra (ver wakeTimer.ts).

export interface Sorteo {
  gjid:      string
  premio:    string
  por:       string
  ganadores: number
  termina:   number
  anotados:  string[]
}

const ARCHIVO = enData('giveaways.json')
let sorteos: Record<string, Sorteo> = leerJson(ARCHIVO, {}, esObjeto)
const despertador = new Despertador(cerrarVencidos)
let sockRef: WASocket | null = null

const guardar = () => guardarJson(ARCHIVO, sorteos)

function armar(): void {
  if (!sockRef) return despertador.desarmar()
  let proximo = Infinity
  for (const s of Object.values(sorteos)) if (s.termina < proximo) proximo = s.termina
  despertador.armar(proximo)
}

/** Cierra el sorteo: elige ganadores y lo anuncia. Devuelve los ganadores. */
export async function cerrar(gjid: string): Promise<string[] | null> {
  const s = sorteos[gjid]
  if (!s) return null
  delete sorteos[gjid]
  guardar()
  armar()
  const ganan = elegirGanadores(s.anotados, s.ganadores)
  const sock = sockRef
  if (sock) {
    const texto = ganan.length
      ? [
          `🎉 *¡SORTEO TERMINADO!*`,
          ``,
          `🎁 *Premio:* ${s.premio}`,
          `👑 *Ganador${ganan.length > 1 ? 'es' : ''}:* ${ganan.map(j => `@${j.split('@')[0]}`).join(', ')}`,
          ``,
          `> Entre ${s.anotados.length} anotado${s.anotados.length === 1 ? '' : 's'}.`,
        ].join('\n')
      : `🎁 El sorteo de *${s.premio}* terminó sin anotados.`
    await safeSend(() => sock.sendMessage(gjid, { text: texto, mentions: [...ganan, s.por] }))
      .catch(err => logger.warn({ err, gjid }, 'sorteo: no se pudo anunciar'))
  }
  return ganan
}

async function cerrarVencidos(): Promise<void> {
  const ahora = Date.now()
  for (const s of Object.values(sorteos)) if (s.termina <= ahora) await cerrar(s.gjid)
  armar()
}

export const sorteoDe = (gjid: string): Sorteo | null => sorteos[gjid] ?? null

export function crear(s: Omit<Sorteo, 'anotados'>): boolean {
  if (sorteos[s.gjid]) return false
  sorteos[s.gjid] = { ...s, anotados: [] }
  guardar()
  armar()
  return true
}

export type Anotar = 'ok' | 'ya' | 'sin-sorteo'

export function anotar(gjid: string, jid: string): Anotar {
  const s = sorteos[gjid]
  if (!s || Date.now() >= s.termina) return 'sin-sorteo'
  if (s.anotados.includes(jid)) return 'ya'
  s.anotados.push(jid)
  guardar()
  return 'ok'
}

export function cancelar(gjid: string): boolean {
  if (!sorteos[gjid]) return false
  delete sorteos[gjid]
  guardar()
  armar()
  return true
}

/** Llamar en cada 'ready': guarda el socket vivo y arma el temporizador. */
export function setupGiveaways(sock: WASocket): void {
  sockRef = sock
  armar()
}
