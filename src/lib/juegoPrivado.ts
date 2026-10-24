// Lo común de los juegos de grupo que hablan por privado (#asesino, #historia).
//
// - Un jugador se reconoce por el id con el que entró al grupo Y por su
//   número real: en grupos con LID el remitente llega como @lid, y el
//   privado puede llegar con cualquiera de los dos. Los privados van al real.
// - Las mesas viven en memoria y usan el socket VIVO: una reconexión lo
//   cambia, así que cada comando lo actualiza.
// - Un temporizador por mesa para la fase en curso; un error en el cambio de
//   fase se anota y no tumba nada.

import type { WASocket } from '@whiskeysockets/baileys'
import { logger } from '@core/logger.js'
import { resolveJidFull } from '@core/lid_mapper.js'
import { safeSend } from '@lib/media_sender.js'

export interface JugadorPrivado { id: string; jid: string; nombre: string }

export async function nuevoJugador(sock: WASocket, sender: string, gjid: string, pushName: string): Promise<JugadorPrivado> {
  const real = await resolveJidFull(sock, sender, gjid)
  return { id: sender, jid: real.jid || sender, nombre: pushName || real.name || sender.split('@')[0]! }
}

interface MesaBase { gjid: string; jugadores: JugadorPrivado[]; timer?: NodeJS.Timeout }

export class Mesas<P extends MesaBase> {
  private readonly mesas = new Map<string, P>()
  private sock: WASocket | null = null

  constructor(private readonly juego: string) {}

  /** Cada comando lo llama con su socket: es el vivo. */
  usar(sock: WASocket): void { this.sock = sock }

  get(gjid: string): P | undefined { return this.mesas.get(gjid) }
  abrir(p: P): void { this.mesas.set(p.gjid, p) }
  sigue(p: P): boolean { return this.mesas.get(p.gjid) === p }

  terminar(p: P): void {
    clearTimeout(p.timer)
    this.mesas.delete(p.gjid)
  }

  /** La mesa y el jugador de `sender`, en cualquier grupo. */
  buscar(sender: string): { p: P; j: P['jugadores'][number] } | null {
    for (const p of this.mesas.values()) {
      const j = p.jugadores.find(x => x.id === sender || x.jid === sender)
      if (j) return { p, j }
    }
    return null
  }

  enviar(a: string, text: string, mentions: string[] = []): Promise<unknown> {
    const sock = this.sock
    if (!sock) return Promise.resolve()
    return safeSend(() => sock.sendMessage(a, { text, mentions }))
  }

  /** El cambio de fase de `p` dentro de `ms`; reemplaza al anterior. */
  armar(p: P, ms: number, f: () => Promise<void>): void {
    clearTimeout(p.timer)
    p.timer = setTimeout(() => {
      void f().catch(err => logger.warn({ err, gjid: p.gjid, juego: this.juego }, 'falló el cambio de fase'))
    }, ms)
    p.timer.unref()
  }
}
