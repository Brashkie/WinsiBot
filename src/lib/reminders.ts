import type { WASocket } from '@whiskeysockets/baileys'
import { logger } from '@core/logger.js'
import { sendCritical } from '@lib/media_sender.js'
import { enData, leerJson, guardarJson } from '@lib/jsonFile.js'
import { Despertador } from '@lib/wakeTimer.js'

// Recordatorios: data/reminders.json, y UN solo temporizador armado para el
// próximo que vence. Nada de revisar la lista cada minuto: con el bot parado
// la mayor parte del tiempo, un setInterval sería despertar el proceso para
// nada. Al agregar o borrar, se vuelve a armar.
//
// Sobreviven a un reinicio: al arrancar se lee el archivo, y los que vencieron
// con el bot apagado salen en ese momento, marcados como atrasados.

const ARCHIVO = enData('reminders.json')

// Si el envío falla (sin conexión), se reintenta en esto.
const REINTENTO  = 60_000

export const MAX_POR_USUARIO = 10

export interface Recordatorio {
  id:     string
  jid:    string     // el chat donde se pidió
  sender: string     // quién lo pidió: se lo menciona
  text:   string
  at:     number     // ms
  creado: number
}

let lista: Recordatorio[] = leerJson(ARCHIVO, [], Array.isArray)
const despertador = new Despertador(disparar)
// El socket vivo. 'ready' llega en cada reconexión con un socket nuevo: se
// actualiza la referencia y NO se arma otro temporizador.
let sockRef: WASocket | null = null

const guardar = () => guardarJson(ARCHIVO, lista)

function armar(): void {
  if (!sockRef) return despertador.desarmar()
  let proximo = Infinity
  for (const r of lista) if (r.at < proximo) proximo = r.at
  despertador.armar(proximo)
}

async function disparar(): Promise<void> {
  const sock = sockRef
  if (!sock) return
  const ahora = Date.now()
  const vencidos = lista.filter(r => r.at <= ahora).sort((a, b) => a.at - b.at)

  for (const r of vencidos) {
    const atraso = ahora - r.at
    const nota = atraso > 5 * 60_000 ? `\n\n> _Llega tarde: el bot estuvo apagado._` : ''
    const esGrupo = r.jid.endsWith('@g.us')
    try {
      await sendCritical(sock, r.jid, {
        text: esGrupo
          ? `⏰ @${r.sender.split('@')[0]}, me pediste que te recordara:\n\n*${r.text}*${nota}`
          : `⏰ Me pediste que te recordara:\n\n*${r.text}*${nota}`,
        mentions: esGrupo ? [r.sender] : [],
      })
      lista = lista.filter(x => x.id !== r.id)
    } catch (err) {
      // Sin conexión: queda en la lista y se vuelve a intentar.
      logger.warn({ err, id: r.id }, 'recordatorios: no se pudo enviar, se reintenta')
      guardar()
      despertador.armar(Date.now() + REINTENTO)
      return
    }
  }
  guardar()
  armar()
}

/** Llamar en cada 'ready': guarda el socket vivo y arma el temporizador. */
export function setupReminders(sock: WASocket): void {
  sockRef = sock
  armar()
}

export function agregarRecordatorio(r: Omit<Recordatorio, 'id' | 'creado'>): Recordatorio {
  const nuevo: Recordatorio = {
    ...r,
    id:     `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    creado: Date.now(),
  }
  lista.push(nuevo)
  guardar()
  armar()
  return nuevo
}

/** Los de un usuario, del más próximo al más lejano. */
export function recordatoriosDe(sender: string): Recordatorio[] {
  return lista.filter(r => r.sender === sender).sort((a, b) => a.at - b.at)
}

/** Borra el n-ésimo (desde 1) de la lista del usuario. */
export function borrarRecordatorio(sender: string, n: number): Recordatorio | null {
  const r = recordatoriosDe(sender)[n - 1]
  if (!r) return null
  lista = lista.filter(x => x.id !== r.id)
  guardar()
  armar()
  return r
}
