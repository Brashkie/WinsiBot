import type { Command } from '../../../types/index.js'
import { getUserData, patchUserData } from '@core/events.js'
import { logger } from '@core/logger.js'
import { safeSend } from '@lib/media_sender.js'
import { Mesas, nuevoJugador, type JugadorPrivado } from '@lib/privateGame.js'
import { historiaIA } from '@lib/nativeBridge.js'
import {
  type Fragmento, MIN_JUGADORES, MAX_JUGADORES, MAX_CARACTERES,
  turnosTotales, turnoDe, loQueVe, limpiar, relato, textoPlano,
} from '@lib/story.js'

// El teléfono descompuesto: ver story.ts para por qué se juega por privado.
//
// Las partidas viven en memoria: duran unos minutos y no hay nada en juego.
// Los privados van solo a quien se anotó (ver privateGame.ts).

const LOBBY  = 2 * 60_000
const TURNO  = 2 * 60_000
const EXP    = 50

type Jugador = JugadorPrivado

interface Partida {
  gjid:       string
  creador:    string
  fase:       'lobby' | 'jugando'
  jugadores:  Jugador[]
  fragmentos: Fragmento[]
  turno:      number      // el turno humano que se espera; 0 fue la primera frase
  total:      number
  ocupada:    boolean     // pidiéndole el giro a la IA: no se aceptan textos
  timer?:     NodeJS.Timeout
}

const mesas = new Mesas<Partida>('historia')
const enviar = mesas.enviar.bind(mesas)
const armar = mesas.armar.bind(mesas)
const terminar = mesas.terminar.bind(mesas)

const nombreDe = (p: Partida, autor: string) => p.jugadores.find(j => j.id === autor)?.nombre ?? 'Alguien'

/** El giro de la IA sobre el último fragmento, si contesta. */
async function giro(p: Partida): Promise<void> {
  p.ocupada = true
  try {
    const t = await historiaIA('seguir', loQueVe(p.fragmentos), p.gjid)
    if (t) p.fragmentos.push({ autor: null, texto: limpiar(t) })
  } finally {
    p.ocupada = false
  }
}

/** Le pide el turno a quien le toca, o termina si no quedan. */
async function pedirTurno(p: Partida): Promise<void> {
  if (!mesas.sigue(p)) return
  if (p.turno >= p.total) return revelar(p)
  const j = turnoDe(p.jugadores, p.turno)
  try {
    await enviar(j.jid, [
      `📞 *Teléfono descompuesto* — te toca (turno ${p.turno + 1}/${p.total})`,
      ``,
      `Solo ves esto:`,
      `> ${loQueVe(p.fragmentos)}`,
      ``,
      `Sigue la historia con \`#historia <tu parte>\` (hasta ${MAX_CARACTERES} caracteres). Tienes ${TURNO / 60_000} min.`,
    ].join('\n'))
  } catch (err) {
    logger.warn({ err, jid: j.jid }, 'historia: no se pudo escribir por privado')
    await enviar(p.gjid, `⏭️ No pude escribirle por privado a *${j.nombre}*: se salta su turno.`)
    p.turno++
    return pedirTurno(p)
  }
  await enviar(p.gjid, `✍️ Turno ${p.turno + 1}/${p.total}: le toca a *${j.nombre}* (por privado).`)
  const esperado = p.turno
  armar(p, TURNO, async () => {
    if (!mesas.sigue(p) || p.turno !== esperado || p.ocupada) return
    await enviar(p.gjid, `⏭️ *${j.nombre}* no escribió a tiempo: sigue el próximo.`)
    p.turno++
    await pedirTurno(p)
  })
}

async function empezar(p: Partida): Promise<void> {
  // Una sola vez, y cerrando la sala antes de escribir a nadie.
  if (p.fase !== 'lobby') return
  p.fase = 'jugando'
  clearTimeout(p.timer)
  p.total = turnosTotales(p.jugadores.length)
  p.turno = 1   // el 0 fue la primera frase, de quien la creó
  await enviar(p.gjid, [
    `📞 *¡Empieza el teléfono descompuesto!* ${p.jugadores.length} jugadores, ${p.total} turnos.`,
    `A cada uno le escribo por privado cuando le toque, y solo va a ver el último pedazo.`,
    `Al final, la historia completa acá.`,
  ].join('\n'))
  await giro(p)
  await pedirTurno(p)
}

async function revelar(p: Partida): Promise<void> {
  terminar(p)
  const titulo = await historiaIA('titulo', textoPlano(p.fragmentos), p.gjid)
  const autores = [...new Set(p.fragmentos.map(f => f.autor).filter((a): a is string => a !== null))]
  for (const a of autores) patchUserData(a, { exp: getUserData(a).exp + EXP })
  await enviar(p.gjid, [
    `📖 *${titulo ?? 'La historia completa'}*`,
    ``,
    relato(p.fragmentos, a => nombreDe(p, a)),
    ``,
    `> Nadie vio más que el pedazo anterior. +${EXP} exp para cada autor.`,
  ].join('\n'))
}

// ─── El comando ───────────────────────────────────────────────────────────────

const command: Command = {
  name:        'historia',
  aliases:     ['telefono', 'teléfono', 'cuento'],
  description: 'Teléfono descompuesto: una historia por turnos, cada uno ve solo el último pedazo  |  !historia nueva <primera frase>',
  category:    'fun',
  cooldown:    2,

  async execute({ sock, jid, msg, sender, pushName, args, prefix, isAdmin, isOwner, isGroup }) {
    mesas.usar(sock)
    const sub = (args[0] ?? '').toLowerCase()
    const responder = (text: string) => safeSend(() => sock.sendMessage(jid, { text }, { quoted: msg }))

    // ─── Por privado: el turno ─────────────────────────────────────────────
    if (!isGroup) {
      const b = mesas.buscar(sender)
      if (!b || b.p.fase !== 'jugando') {
        await responder(`> No estás en ninguna historia en curso. Se arma en un grupo con \`${prefix}historia nueva <primera frase>\`.`)
        return
      }
      const { p } = b
      if (turnoDe(p.jugadores, p.turno) !== b.j) {
        await responder(`> Todavía no es tu turno: te escribo cuando te toque.`)
        return
      }
      if (p.ocupada) {
        await responder(`> Un momento, estoy pasando el pedazo anterior.`)
        return
      }
      const texto = limpiar(args.join(' '))
      if (!texto) {
        await responder(`> Escribe tu parte: \`${prefix}historia <tu parte>\``)
        return
      }
      p.fragmentos.push({ autor: b.j.id, texto })
      p.turno++
      clearTimeout(p.timer)
      await responder(`✅ Anotado. Le paso la historia al siguiente.`)
      if (p.turno < p.total) await giro(p)
      await pedirTurno(p)
      return
    }

    const p = mesas.get(jid)

    // ─── !historia nueva <primera frase> ───────────────────────────────────
    if (sub === 'nueva' || sub === 'crear') {
      if (p) { await responder(`> Ya hay una historia en este grupo.`); return }
      if (mesas.buscar(sender)) { await responder(`> Ya estás en una historia en otro grupo.`); return }
      const inicio = limpiar(args.slice(1).join(' '))
      if (!inicio) { await responder(`> Empieza con la primera frase: \`${prefix}historia nueva Había una vez un gato que…\``); return }
      const nueva: Partida = {
        gjid: jid, creador: sender, fase: 'lobby',
        jugadores: [await nuevoJugador(sock, sender, jid, pushName)],
        fragmentos: [{ autor: sender, texto: inicio }],
        turno: 0, total: 0, ocupada: false,
      }
      mesas.abrir(nueva)
      armar(nueva, LOBBY, async () => {
        if (!mesas.sigue(nueva) || nueva.fase !== 'lobby') return
        if (nueva.jugadores.length >= MIN_JUGADORES) return empezar(nueva)
        terminar(nueva)
        await enviar(jid, `⌛ No se juntaron ${MIN_JUGADORES} jugadores: la historia se cancela.`)
      })
      // La primera frase ya la vio todo el grupo: es el punto de partida,
      // no una parte secreta. Lo que no se ve es lo que viene después.
      await responder([
        `📞 *Teléfono descompuesto* — ${nueva.jugadores[0]!.nombre} empezó una historia.`,
        ``,
        `Por turnos, cada uno la sigue por privado viendo SOLO el último pedazo,`,
        `y entre turno y turno la IA le mete un giro. Al final, se revela todo.`,
        `> \`${prefix}historia unirme\` · empieza sola en ${LOBBY / 60_000} min, o \`${prefix}historia empezar\``,
      ].join('\n'))
      return
    }

    if (sub === 'unirme' || sub === 'unir' || sub === 'entrar' || sub === 'join') {
      if (!p || p.fase !== 'lobby') { await responder(`> No hay una historia esperando jugadores: \`${prefix}historia nueva <primera frase>\``); return }
      if (mesas.buscar(sender)) { await responder(`> Ya estás en una historia.`); return }
      if (p.jugadores.length >= MAX_JUGADORES) { await responder(`> Está llena (${MAX_JUGADORES}).`); return }
      p.jugadores.push(await nuevoJugador(sock, sender, jid, pushName))
      await responder(`✅ Van *${p.jugadores.length}*${p.jugadores.length < MIN_JUGADORES ? ` (faltan ${MIN_JUGADORES - p.jugadores.length})` : ''}.`)
      if (p.jugadores.length >= MAX_JUGADORES) await empezar(p)
      return
    }

    if (sub === 'empezar' || sub === 'start') {
      if (!p || p.fase !== 'lobby') { await responder(`> No hay una historia esperando.`); return }
      if (p.creador !== sender && !isAdmin && !isOwner) { await responder(`> La empieza quien la creó, o un admin.`); return }
      if (p.jugadores.length < MIN_JUGADORES) { await responder(`> Faltan ${MIN_JUGADORES - p.jugadores.length} jugador(es).`); return }
      await empezar(p)
      return
    }

    if (sub === 'cancelar' || sub === 'terminar') {
      if (!p) { await responder(`> No hay historia.`); return }
      if (p.creador !== sender && !isAdmin && !isOwner) { await responder(`> La cancela quien la creó, o un admin.`); return }
      terminar(p)
      await responder(`🛑 Historia cancelada.`)
      return
    }

    if (p && p.fase === 'jugando') {
      await responder(`> La historia se escribe por privado, cuando te toca: así nadie ve más que el pedazo anterior.`)
      return
    }
    if (p) {
      await responder(`📞 Esperando jugadores (${p.jugadores.length}/${MAX_JUGADORES}): ${p.jugadores.map(j => j.nombre).join(', ')}\n> \`${prefix}historia unirme\``)
      return
    }
    await responder([
      `╭─「 📞 TELÉFONO DESCOMPUESTO 」`,
      `│`,
      `│ Una historia por turnos, de ${MIN_JUGADORES} a ${MAX_JUGADORES} jugadores.`,
      `│ Cada uno la sigue por privado viendo SOLO el último pedazo,`,
      `│ y la IA le mete un giro entre turno y turno.`,
      `│ Al final se revela entera, con título.`,
      `│`,
      `╰─ \`${prefix}historia nueva <primera frase>\` · \`${prefix}historia unirme\``,
    ].join('\n'))
  },
}

export default command
