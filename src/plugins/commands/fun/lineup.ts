import type { Command } from '../../../types/index.js'
import { safeSend } from '@lib/media_sender.js'
import { enData, leerJson, guardarJson, esObjeto } from '@lib/jsonFile.js'
import { randomChoice } from '@lib/utils.js'
import {
  type Equipo, type Lista, FORMATOS, MAPAS,
  formatoDe, maxSuplentes, nueva, unir, salir, dondeEsta,
} from '@lib/lineup.js'

// #lista: listas para partidas por equipos (ver lineup.ts), una por grupo,
// guardadas en data/lineups.json. `#mapa` sortea un mapa de Free Fire.

const ARCHIVO = enData('lineups.json')
const listas: Record<string, Lista> = leerJson(ARCHIVO, {}, esObjeto)
const guardar = () => guardarJson(ARCHIVO, listas)
/** Una lista sin tocar en 12 h se considera vieja y se puede crear otra encima. */
const VIEJA = 12 * 3_600_000

const EQUIPOS: Record<string, Equipo> = { a: 'A', '1': 'A', b: 'B', '2': 'B', s: 'S', suplente: 'S', suplentes: 'S' }

function pantalla(l: Lista): string {
  const fila = (e: Equipo, n: number) =>
    Array.from({ length: n }, (_, i) => `│ ${i + 1}. ${l[e][i] ? `@${l[e][i]!.split('@')[0]}` : '—'}`)
  return [
    `╭─「 🎮 ${l.titulo} — ${l.porEquipo}vs${l.porEquipo} 」`,
    `│`,
    `│ 🔵 *Equipo A*`,
    ...fila('A', l.porEquipo),
    `│`,
    `│ 🔴 *Equipo B*`,
    ...fila('B', l.porEquipo),
    `│`,
    `│ 🪑 *Suplentes*`,
    ...fila('S', maxSuplentes(l.porEquipo)),
    `╰─ \`#lista unirme [A|B|S]\` · \`#lista salir\` · \`#mapa\``,
  ].join('\n')
}

const menciones = (l: Lista) => [...l.A, ...l.B, ...l.S]

const command: Command = {
  name:        'lista',
  aliases:     ['lineup', 'scrim', 'versus', 'mapa', 'mapas'],
  description: 'Listas de partidas por equipos (4vs4 a 24vs24)  |  !lista 4vs4 [título]  ·  !lista unirme  ·  !mapa',
  category:    'fun',
  cooldown:    2,
  groupOnly:   true,

  async execute({ sock, jid, msg, sender, args, prefix, isAdmin, isOwner, command: usado }) {
    const responder = (text: string, mentions: string[] = []) =>
      safeSend(() => sock.sendMessage(jid, { text, mentions }, { quoted: msg }))

    // ─── #mapa ─────────────────────────────────────────────────────────────
    if (usado === 'mapa' || usado === 'mapas' || (args[0] ?? '').toLowerCase() === 'mapa') {
      await responder(`🗺️ *Mapa:* ${randomChoice(MAPAS)}`)
      return
    }

    const sub = (args[0] ?? '').toLowerCase()
    const l = listas[jid]

    // ─── crear: #lista 4vs4 [título] ───────────────────────────────────────
    const n = formatoDe(sub)
    if (n) {
      if (l && Date.now() - l.creada < VIEJA && l.creador !== sender && !isAdmin && !isOwner) {
        await responder(`> Ya hay una lista abierta. La reemplaza quien la creó o un admin.\n\n${pantalla(l)}`, menciones(l))
        return
      }
      const titulo = args.slice(1).join(' ').trim().slice(0, 40) || 'Partida'
      listas[jid] = nueva(titulo, n, sender)
      unir(listas[jid]!, sender)
      guardar()
      await responder(pantalla(listas[jid]!), [sender])
      return
    }

    if (!l) {
      await responder(`🎮 \`${prefix}lista 4vs4 [título]\` — formatos: ${FORMATOS.map(f => `${f}vs${f}`).join(', ')}\n🗺️ \`${prefix}mapa\` — un mapa al azar`)
      return
    }

    // ─── unirme / salir / borrar ───────────────────────────────────────────
    if (['unirme', 'unir', 'join', 'entrar', 'yo'].includes(sub)) {
      const pedido = EQUIPOS[(args[1] ?? '').toLowerCase()]
      const r = unir(l, sender, pedido)
      if (!r.ok) {
        await responder(r.motivo === 'llena' ? `> La lista está llena.` : `> Ese equipo está lleno. Prueba el otro o \`${prefix}lista unirme S\`.`)
        return
      }
      guardar()
      await responder(pantalla(l), menciones(l))
      return
    }
    if (['salir', 'leave', 'quitarme'].includes(sub)) {
      const r = salir(l, sender)
      if (!r.salio) { await responder(`> No estabas en la lista.`); return }
      guardar()
      await responder(`${r.subio ? `⬆️ @${r.subio.split('@')[0]} sube de suplente.\n\n` : ''}${pantalla(l)}`, menciones(l))
      return
    }
    if (['borrar', 'cerrar', 'terminar', 'delete'].includes(sub)) {
      if (l.creador !== sender && !isAdmin && !isOwner) { await responder(`> La borra quien la creó o un admin.`); return }
      delete listas[jid]
      guardar()
      await responder(`🗑️ Lista borrada.`)
      return
    }

    // ─── la lista ──────────────────────────────────────────────────────────
    const yo = dondeEsta(l, sender)
    await responder(`${pantalla(l)}${yo ? '' : `\n\n> No estás: \`${prefix}lista unirme\``}`, menciones(l))
  },
}

export default command
