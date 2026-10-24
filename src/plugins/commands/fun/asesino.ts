import type { Command } from '../../../types/index.js'
import { getUserData, patchUserData } from '@core/events.js'
import { logger } from '@core/logger.js'
import { safeSend } from '@lib/media_sender.js'
import { Mesas, nuevoJugador, type JugadorPrivado } from '@lib/juegoPrivado.js'
import {
  type Rol, MIN_JUGADORES, MAX_JUGADORES, NOMBRE_ROL,
  repartir, resolverNoche, contarVotos, ganador, puedeSalvar,
} from '@lib/asesino.js'

// "Asesino en el chat": ver asesino.ts para las reglas.
//
// Las partidas viven en memoria: duran minutos y no hay nada apostado, así
// que si el bot se reinicia a la mitad se pierde la partida y nadie pierde
// dinero. Los roles y las acciones de noche van por PRIVADO, y solo a quien
// se anotó en la partida: el bot no le escribe a nadie que no lo pidió.
//
// Cómo se reconoce a un jugador y a dónde van los privados: ver juegoPrivado.ts.

const LOBBY  = 3 * 60_000
const NOCHE  = 90_000
const DIA    = 3 * 60_000
const PREMIO = 800

interface Jugador extends JugadorPrivado { asiento: number }

interface Partida {
  gjid:          string
  creador:       string
  fase:          'lobby' | 'noche' | 'dia'
  jugadores:     Jugador[]
  roles:         Rol[]
  vivos:         Set<number>
  ronda:         number
  matar:         Map<number, number>   // asiento del asesino → objetivo
  salvar:        number | null
  investigar:    number | null
  ultimoSalvado: number | null
  votos:         Map<number, number>   // votante → objetivo (0 = nadie)
  timer?:        NodeJS.Timeout
}

const mesas = new Mesas<Partida>('asesino')
const enviar = mesas.enviar.bind(mesas)
const armar = mesas.armar.bind(mesas)
const terminar = mesas.terminar.bind(mesas)

const nombreDe = (p: Partida, asiento: number) => p.jugadores[asiento - 1]?.nombre ?? `#${asiento}`
const rolDe = (p: Partida, asiento: number) => p.roles[asiento - 1]!

function lista(p: Partida, excluir: (a: number) => boolean = () => false): string {
  return [...p.vivos].sort((a, b) => a - b)
    .filter(a => !excluir(a))
    .map(a => `  *${a}* — ${nombreDe(p, a)}`)
    .join('\n')
}

// ─── Fases ────────────────────────────────────────────────────────────────────

async function empezar(p: Partida): Promise<void> {
  // Una sola vez (el temporizador de la sala y `#asesino empezar` pueden
  // llegar juntos), y cerrando la sala ANTES del primer privado: mientras se
  // mandan, nadie más puede sumarse y quedarse sin rol.
  if (p.fase !== 'lobby') return
  p.fase = 'noche'
  clearTimeout(p.timer)
  p.roles = repartir(p.jugadores.length)
  p.vivos = new Set(p.jugadores.map(j => j.asiento))
  const asesinos = p.jugadores.filter(j => rolDe(p, j.asiento) === 'asesino')

  // Si a alguien no se le puede escribir por privado, no hay partida: jugaría
  // sin saber su rol.
  for (const j of p.jugadores) {
    const rol = rolDe(p, j.asiento)
    const extra = {
      asesino:   asesinos.length > 1
        ? `Tu compañero: *${asesinos.filter(x => x !== j).map(x => `${x.asiento} — ${x.nombre}`).join(', ')}*. De noche, elijan a quién matar.`
        : `De noche eliges a quién matar.`,
      detective: `De noche investigas a alguien y te digo si es asesino.`,
      medico:    `De noche eliges a quién salvar (no a la misma persona dos noches seguidas).`,
      ciudadano: `No tienes acción de noche: de día, descubre al asesino y vota.`,
    }[rol]
    try {
      await enviar(j.jid, [
        `🎭 *Asesino en el chat* — eres *${NOMBRE_ROL[rol]}*`,
        ``,
        extra,
        `Las acciones de noche van por ACÁ, por privado: si las escribes en el grupo, todos sabrán tu rol.`,
        `_No le digas a nadie tu rol._`,
      ].join('\n'))
    } catch (err) {
      logger.warn({ err, jid: j.jid }, 'asesino: no se pudo escribir por privado')
      terminar(p)
      await enviar(p.gjid, `❌ No pude escribirle por privado a *${j.nombre}*, así que no hay partida. Que me escriba algo por privado primero y prueben de nuevo.`)
      return
    }
  }
  await enviar(p.gjid, [
    `🎭 *¡Empieza la partida!* ${p.jugadores.length} jugadores; cada uno recibió su rol por privado.`,
    `Hay ${asesinos.length} asesino(s) entre ustedes.`,
  ].join('\n'))
  await noche(p)
}

async function noche(p: Partida): Promise<void> {
  p.fase = 'noche'
  p.ronda++
  p.matar.clear()
  p.salvar = null
  p.investigar = null
  await enviar(p.gjid, `🌙 *Noche ${p.ronda}.* El pueblo duerme… (${NOCHE / 1000} s)`)

  for (const a of p.vivos) {
    const rol = rolDe(p, a)
    const j = p.jugadores[a - 1]!
    if (rol === 'asesino') {
      await enviar(j.jid, `🔪 Noche ${p.ronda}: ¿a quién matas?\n${lista(p, x => rolDe(p, x) === 'asesino')}\n\n> \`#asesino matar <número>\``)
    } else if (rol === 'detective') {
      await enviar(j.jid, `🔍 Noche ${p.ronda}: ¿a quién investigas?\n${lista(p, x => x === a)}\n\n> \`#asesino investigar <número>\``)
    } else if (rol === 'medico') {
      await enviar(j.jid, `🩺 Noche ${p.ronda}: ¿a quién salvas?\n${lista(p)}\n\n> \`#asesino salvar <número>\`${p.ultimoSalvado ? `  (no puedes repetir al ${p.ultimoSalvado})` : ''}`)
    }
  }
  armar(p, NOCHE, () => amanecer(p))
}

/** ¿Ya actuaron todos los que tienen acción de noche? */
function nocheCompleta(p: Partida): boolean {
  for (const a of p.vivos) {
    const rol = rolDe(p, a)
    if (rol === 'asesino' && !p.matar.has(a)) return false
    if (rol === 'detective' && p.investigar === null) return false
    if (rol === 'medico' && p.salvar === null) return false
  }
  return true
}

async function amanecer(p: Partida): Promise<void> {
  if (!mesas.sigue(p) || p.fase !== 'noche') return
  const muerto = resolverNoche([...p.matar.values()], p.salvar)
  p.ultimoSalvado = p.salvar

  const det = [...p.vivos].find(a => rolDe(p, a) === 'detective')
  if (det && p.investigar !== null) {
    const es = rolDe(p, p.investigar) === 'asesino'
    await enviar(p.jugadores[det - 1]!.jid, `🔍 *${p.investigar} — ${nombreDe(p, p.investigar)}* ${es ? '*ES* un asesino. 🔪' : 'no es asesino.'}`)
  }

  if (muerto !== null) {
    p.vivos.delete(muerto)
    await enviar(p.gjid, `☀️ *Amanece.* ${nombreDe(p, muerto)} (${muerto}) apareció muerto. Era ${NOMBRE_ROL[rolDe(p, muerto)]}.`)
  } else {
    await enviar(p.gjid, `☀️ *Amanece.* Esta noche no murió nadie.`)
  }
  if (await final(p)) return
  await dia(p)
}

async function dia(p: Partida): Promise<void> {
  p.fase = 'dia'
  p.votos.clear()
  await enviar(p.gjid, [
    `🗣️ *Día ${p.ronda}.* Debatan y voten a quién expulsar (${DIA / 60_000} min):`,
    lista(p),
    ``,
    `> \`#asesino votar <número>\` · \`#asesino votar 0\` para no expulsar a nadie`,
  ].join('\n'))
  armar(p, DIA, () => anochecer(p))
}

async function anochecer(p: Partida): Promise<void> {
  if (!mesas.sigue(p) || p.fase !== 'dia') return
  const { expulsado, conteo } = contarVotos(p.votos)
  const resumen = [...conteo].sort((a, b) => b[1] - a[1])
    .map(([a, n]) => `${a === 0 ? 'nadie' : nombreDe(p, a)}: ${n}`).join(' · ')
  if (expulsado !== null) {
    p.vivos.delete(expulsado)
    await enviar(p.gjid, `⚖️ Votos: ${resumen || 'ninguno'}\nEl pueblo expulsa a *${nombreDe(p, expulsado)}*. Era ${NOMBRE_ROL[rolDe(p, expulsado)]}.`)
  } else {
    await enviar(p.gjid, `⚖️ Votos: ${resumen || 'ninguno'}\nNo hay mayoría: nadie es expulsado.`)
  }
  if (await final(p)) return
  await noche(p)
}

async function final(p: Partida): Promise<boolean> {
  const g = ganador(p.roles, p.vivos)
  if (!g) return false
  terminar(p)
  const ganadores = p.jugadores.filter(j => (rolDe(p, j.asiento) === 'asesino') === (g === 'asesinos'))
  for (const j of ganadores) {
    patchUserData(j.id, { money: getUserData(j.id).money + PREMIO })
  }
  await enviar(p.gjid, [
    g === 'pueblo' ? `🎉 *¡Gana el pueblo!* Ya no quedan asesinos.` : `🔪 *¡Ganan los asesinos!*`,
    ``,
    ...p.jugadores.map(j => `  ${j.asiento}. ${j.nombre} — ${NOMBRE_ROL[rolDe(p, j.asiento)]}${p.vivos.has(j.asiento) ? '' : ' 💀'}`),
    ``,
    `> +¥${PREMIO} para cada ganador.`,
  ].join('\n'), ganadores.map(j => j.id))
  return true
}

// ─── El comando ───────────────────────────────────────────────────────────────

const DE_NOCHE: Record<string, Rol> = { matar: 'asesino', asesinar: 'asesino', investigar: 'detective', salvar: 'medico' }

const command: Command = {
  name:        'asesino',
  aliases:     ['mafia', 'asesinos', 'votar', 'investigar', 'salvar', 'asesinar'],
  description: 'Asesino en el chat (estilo Mafia), de 4 a 10 jugadores  |  !asesino crear · unirme · empezar · votar <n>',
  category:    'fun',
  cooldown:    2,

  async execute({ sock, jid, msg, sender, pushName, args, prefix, isAdmin, isOwner, isGroup, command: usado }) {
    mesas.usar(sock)
    const directo = ['votar', 'investigar', 'salvar', 'asesinar'].includes(usado)
    const sub = (directo ? usado : (args[0] ?? '')).toLowerCase()
    const arg = directo ? args[0] : args[1]
    const responder = (text: string, mentions: string[] = []) =>
      safeSend(() => sock.sendMessage(jid, { text, mentions }, { quoted: msg }))

    // ─── Acciones de noche: por privado ────────────────────────────────────
    if (DE_NOCHE[sub]) {
      if (isGroup) {
        // Sin decir nada del rol: la respuesta la ve todo el grupo.
        await responder(`> Las acciones de noche van por privado.`)
        return
      }
      const b = mesas.buscar(sender)
      if (!b || b.p.fase !== 'noche') {
        await responder(`> No es de noche en ninguna partida tuya.`)
        return
      }
      const { p, j } = b
      if (!p.vivos.has(j.asiento) || rolDe(p, j.asiento) !== DE_NOCHE[sub]) {
        await responder(`> No puedes hacer eso.`)
        return
      }
      const obj = parseInt(arg ?? '')
      if (!p.vivos.has(obj)) {
        await responder(`> Ese número no es de nadie vivo.`)
        return
      }
      if (DE_NOCHE[sub] === 'asesino') {
        if (rolDe(p, obj) === 'asesino') { await responder(`> No puedes matar a otro asesino.`); return }
        p.matar.set(j.asiento, obj)
      } else if (DE_NOCHE[sub] === 'detective') {
        if (obj === j.asiento) { await responder(`> No puedes investigarte a ti mismo.`); return }
        p.investigar = obj
      } else {
        if (!puedeSalvar(obj, p.ultimoSalvado)) { await responder(`> No puedes salvar al mismo dos noches seguidas.`); return }
        p.salvar = obj
      }
      await responder(`✅ Anotado: *${obj} — ${nombreDe(p, obj)}*.`)
      if (nocheCompleta(p)) armar(p, 0, () => amanecer(p))
      return
    }

    if (!isGroup) {
      await responder(`> "Asesino en el chat" se juega en un grupo: \`${prefix}asesino crear\` ahí.`)
      return
    }
    const p = mesas.get(jid)

    // ─── !asesino crear ────────────────────────────────────────────────────
    if (sub === 'crear' || sub === 'nueva' || sub === 'iniciar') {
      if (p) { await responder(`> Ya hay una partida en este grupo: \`${prefix}asesino estado\``); return }
      if (mesas.buscar(sender)) { await responder(`> Ya estás en una partida en otro grupo.`); return }
      const nueva: Partida = {
        gjid: jid, creador: sender, fase: 'lobby',
        jugadores: [{ asiento: 1, ...await nuevoJugador(sock, sender, jid, pushName) }],
        roles: [], vivos: new Set(), ronda: 0, matar: new Map(), salvar: null, investigar: null,
        ultimoSalvado: null, votos: new Map(),
      }
      mesas.abrir(nueva)
      armar(nueva, LOBBY, async () => {
        if (!mesas.sigue(nueva) || nueva.fase !== 'lobby') return
        if (nueva.jugadores.length >= MIN_JUGADORES) return empezar(nueva)
        terminar(nueva)
        await enviar(jid, `⌛ No se juntaron ${MIN_JUGADORES} jugadores: la partida se cancela.`)
      })
      await responder([
        `🎭 *Asesino en el chat* — partida abierta por ${nueva.jugadores[0]!.nombre}`,
        ``,
        `Entre ${MIN_JUGADORES} y ${MAX_JUGADORES} jugadores. Los roles llegan por privado.`,
        `> \`${prefix}asesino unirme\` · empieza sola en ${LOBBY / 60_000} min, o \`${prefix}asesino empezar\``,
      ].join('\n'))
      return
    }

    // ─── !asesino unirme ───────────────────────────────────────────────────
    if (sub === 'unirme' || sub === 'unir' || sub === 'entrar' || sub === 'join') {
      if (!p || p.fase !== 'lobby') { await responder(`> No hay una partida esperando jugadores: \`${prefix}asesino crear\``); return }
      if (mesas.buscar(sender)) { await responder(`> Ya estás en una partida.`); return }
      if (p.jugadores.length >= MAX_JUGADORES) { await responder(`> La partida está llena (${MAX_JUGADORES}).`); return }
      p.jugadores.push({ asiento: p.jugadores.length + 1, ...await nuevoJugador(sock, sender, jid, pushName) })
      await responder(`✅ ${pushName || 'Te uniste'} — van *${p.jugadores.length}*${p.jugadores.length < MIN_JUGADORES ? ` (faltan ${MIN_JUGADORES - p.jugadores.length})` : ''}.`)
      if (p.jugadores.length >= MAX_JUGADORES) await empezar(p)
      return
    }

    // ─── !asesino empezar / cancelar ───────────────────────────────────────
    if (sub === 'empezar' || sub === 'start') {
      if (!p || p.fase !== 'lobby') { await responder(`> No hay una partida esperando.`); return }
      if (p.creador !== sender && !isAdmin && !isOwner) { await responder(`> La empieza quien la creó, o un admin.`); return }
      if (p.jugadores.length < MIN_JUGADORES) { await responder(`> Faltan ${MIN_JUGADORES - p.jugadores.length} jugador(es).`); return }
      await empezar(p)
      return
    }
    if (sub === 'cancelar' || sub === 'terminar') {
      if (!p) { await responder(`> No hay partida.`); return }
      if (p.creador !== sender && !isAdmin && !isOwner) { await responder(`> La cancela quien la creó, o un admin.`); return }
      terminar(p)
      await responder(`🛑 Partida cancelada.`)
      return
    }

    // ─── !asesino votar <n> ────────────────────────────────────────────────
    if (sub === 'votar' || sub === 'voto') {
      if (!p || p.fase !== 'dia') { await responder(`> Ahora no se vota.`); return }
      const j = p.jugadores.find(x => x.id === sender || x.jid === sender)
      if (!j || !p.vivos.has(j.asiento)) { await responder(`> Solo votan los jugadores vivos.`); return }
      const obj = parseInt(arg ?? '')
      if (obj !== 0 && !p.vivos.has(obj)) { await responder(`> Ese número no es de nadie vivo (0 = no expulsar a nadie).`); return }
      p.votos.set(j.asiento, obj)
      await responder(`🗳️ ${j.nombre} vota ${obj === 0 ? 'no expulsar a nadie' : `a *${nombreDe(p, obj)}*`} (${p.votos.size}/${p.vivos.size}).`)
      if (p.votos.size >= p.vivos.size) armar(p, 0, () => anochecer(p))
      return
    }

    // ─── !asesino — el estado ──────────────────────────────────────────────
    if (!p) {
      await responder([
        `╭─「 🎭 ASESINO EN EL CHAT 」`,
        `│`,
        `│ ${MIN_JUGADORES} a ${MAX_JUGADORES} jugadores. Hay un asesino (dos desde 8),`,
        `│ un detective y un médico (desde 5); el resto, ciudadanos.`,
        `│ De noche, los roles actúan por privado. De día, el grupo`,
        `│ debate y vota a quién expulsar.`,
        `│`,
        `│ \`${prefix}asesino crear\` · \`${prefix}asesino unirme\` · \`${prefix}asesino empezar\``,
        `│ \`${prefix}asesino votar <n>\` (de día, en el grupo)`,
        `╰─ Premio: ¥${PREMIO} para cada ganador`,
      ].join('\n'))
      return
    }
    await responder(p.fase === 'lobby'
      ? `🎭 Esperando jugadores (${p.jugadores.length}/${MAX_JUGADORES}):\n${p.jugadores.map(j => `  ${j.asiento}. ${j.nombre}`).join('\n')}\n> \`${prefix}asesino unirme\``
      : `🎭 ${p.fase === 'noche' ? `🌙 Noche ${p.ronda}` : `🗣️ Día ${p.ronda}`} — vivos:\n${lista(p)}`)
  },
}

export default command
