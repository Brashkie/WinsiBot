import type { WASocket } from '@whiskeysockets/baileys'
import { logger } from '@core/logger.js'
import { getUserData, patchUserData, checkLevelUp } from '@core/events.js'
import { safeSend } from '@lib/media_sender.js'
import {
  JEFES, VENTANA_REACCION, vidaJefe, danio, repartir, barra, reaccion, contraataque, type Premio, type Reaccion,
} from '@lib/raid.js'
import { bonoArma } from '@lib/forge.js'
import { companeroDe, bonoCuidado } from '@lib/companion.js'
import { herir, saludDe } from '@lib/health.js'
import { findDragon } from '@lib/dragoncity.js'
import { enData, leerJson, guardarJson, esObjeto } from '@lib/jsonFile.js'
import { Despertador } from '@lib/wakeTimer.js'

/** Los elementos de una especie, del catálogo. Sin catálogo, ninguno: el
 *  golpe pega igual, solo que no puede dar reacción. */
async function elementosDe(id: number): Promise<string[]> {
  try {
    return (await findDragon(id))?.elements ?? []
  } catch {
    return []
  }
}

// El jefe de mundo: UNO para todos los grupos a la vez. Cada golpe, venga del
// grupo que venga, le baja la misma vida, y el botín se reparte entre todos
// los que pegaron.
//
// Aparece solo cada RAID_CADA_H horas (6 por defecto) y se queda RAID_DURA_MIN
// minutos (60); si nadie lo tumba, se escapa y deja un premio de consolación.
// Igual que los recordatorios, hay UN temporizador —para la próxima aparición
// o para la huida— y el estado vive en data/raid.json, así que un reinicio no
// borra un jefe a medio pelear.
//
// Los avisos van SOLO a los grupos que lo activaron (`#raid on`, admins) y a
// los que ya están peleando: el bot no le escribe a un grupo que no lo pidió.

const ARCHIVO = enData('raid.json')

const CADA     = Math.max(1, Number(process.env.RAID_CADA_H) || 6) * 3_600_000
const DURA     = Math.max(5, Number(process.env.RAID_DURA_MIN) || 60) * 60_000
const VARIA    = 30 * 60_000          // ±30 min, para que no salga siempre a la misma hora
const CONSUELO = 0.25                 // si se escapa, un cuarto del botín

export interface JefeVivo {
  id:       string
  vida:     number
  vidaMax:  number
  aparecio: number
  expira:   number
  danios:   Record<string, number>   // jid → daño total
  golpes:   number
  grupos:   string[]                 // donde se peleó: ahí se avisa cómo terminó
  // El golpe anterior, para la sinergia elemental (ver raid.ts). `usado`: ya
  // formó una reacción, y no sirve de base para otra.
  ultimo?:  { jid: string; elementos: string[]; ts: number; usado: boolean }
}

interface Estado {
  jefe:                  JefeVivo | null
  proximo:               number
  participantesAnterior: number
  grupos:                string[]    // los que activaron los avisos
}

let estado: Estado = cargar()
const despertador = new Despertador(despertar)
let sockRef: WASocket | null = null

function cargar(): Estado {
  const v = leerJson<Record<string, any>>(ARCHIVO, {}, esObjeto)
  return {
    jefe:                  v.jefe ?? null,
    proximo:               Number(v.proximo) || 0,
    participantesAnterior: Number(v.participantesAnterior) || 0,
    grupos:                Array.isArray(v.grupos) ? v.grupos : [],
  }
}

const guardar = () => guardarJson(ARCHIVO, estado)

const proximaAparicion = () => Date.now() + CADA + Math.round((Math.random() * 2 - 1) * VARIA)
export const defJefe = (id: string) => JEFES.find(j => j.id === id) ?? JEFES[0]!

function armar(): void {
  if (!sockRef) return despertador.desarmar()
  despertador.armar(estado.jefe ? estado.jefe.expira : estado.proximo)
}

async function despertar(): Promise<void> {
  const ahora = Date.now()
  try {
    if (estado.jefe && ahora >= estado.jefe.expira) await escapar()
    else if (!estado.jefe && ahora >= estado.proximo) await aparecer()
  } catch (err) {
    logger.warn({ err }, 'raid: falló el cambio de estado')
  }
  armar()
}

/** A una lista de grupos, de a uno: el embudo de salida pone el ritmo. */
async function avisar(grupos: Iterable<string>, text: string, mentions: string[] = [], salvo?: string): Promise<void> {
  const sock = sockRef
  if (!sock) return
  for (const g of new Set(grupos)) {
    if (g === salvo) continue
    try {
      await safeSend(() => sock.sendMessage(g, { text, mentions }))
    } catch (err) {
      logger.debug({ err, g }, 'raid: no se pudo avisar a un grupo')
    }
  }
}

/** Hace aparecer un jefe. `false` si ya hay uno. */
export async function aparecer(): Promise<boolean> {
  if (estado.jefe) return false
  const def = JEFES[Math.floor(Math.random() * JEFES.length)]!
  const vida = vidaJefe(def, estado.participantesAnterior)
  const ahora = Date.now()
  estado.jefe = {
    id: def.id, vida, vidaMax: vida, aparecio: ahora, expira: ahora + DURA,
    danios: {}, golpes: 0, grupos: [],
  }
  guardar()
  armar()
  await avisar(estado.grupos, [
    `╭─「 ${def.emoji} JEFE DE MUNDO 」`,
    `│`,
    `│ *${def.nombre}* apareció.`,
    `│ ❤ ${vida.toLocaleString()} de vida`,
    `│ ⏳ ${Math.round(DURA / 60_000)} minutos antes de que escape`,
    `│`,
    `╰─ Todos los grupos pelean contra el mismo: \`#raid atacar\``,
  ].join('\n'))
  return true
}

function pagar(premios: Premio[]): void {
  for (const p of premios) {
    const u = getUserData(p.jid)
    patchUserData(p.jid, { money: u.money + p.dinero, exp: u.exp + p.exp })
    checkLevelUp(p.jid)
  }
}

function tabla(premios: Premio[], max = 5): string[] {
  return premios.slice(0, max).map((p, i) =>
    `│ ${i + 1}. @${p.jid.split('@')[0]}  +¥${p.dinero.toLocaleString()}  +${p.exp} exp${p.mvp ? '  🏆 MVP' : ''}${p.remate ? '  🗡️ remate' : ''}`)
}

async function escapar(): Promise<void> {
  const j = estado.jefe
  if (!j) return
  const def = defJefe(j.id)
  const premios = repartir(j.danios, j.vidaMax, null, CONSUELO)
  pagar(premios)
  estado.jefe = null
  estado.participantesAnterior = premios.length
  estado.proximo = proximaAparicion()
  guardar()
  await avisar([...j.grupos, ...estado.grupos], [
    `╭─「 ${def.emoji} SE ESCAPÓ 」`,
    `│`,
    `│ *${def.nombre}* huyó con ${j.vida.toLocaleString()}/${j.vidaMax.toLocaleString()} de vida.`,
    ...(premios.length
      ? [`│ Premio de consolación para ${premios.length} valiente(s):`, ...tabla(premios)]
      : [`│ Nadie lo enfrentó.`]),
    `╰─`,
  ].join('\n'), premios.slice(0, 5).map(p => p.jid))
}

export type Ataque =
  | { ok: false; motivo: 'sin-jefe'; proximo: number }
  | {
      ok: true; danio: number; critico: boolean; frase: string; jefe: JefeVivo; premios: Premio[] | null; texto: string
      elementos: string[]; reaccion: (Reaccion & { con: string }) | null
      /** Lo que devolvió el jefe (0 si no contraatacó) y la salud que te queda. */
      contra: number; salud: number; cuidados: number
    }

/** Un golpe de `sender` desde el grupo `gjid`. Si lo tumba, paga y avisa a los demás grupos. */
export async function atacar(sender: string, gjid: string): Promise<Ataque> {
  if (!estado.jefe || Date.now() >= estado.jefe.expira) return { ok: false, motivo: 'sin-jefe', proximo: estado.proximo }

  // Lo único que espera (el catálogo, casi siempre en memoria) va ANTES de
  // tocar al jefe: en esa espera otro pudo tumbarlo, así que se vuelve a mirar.
  const u = getUserData(sender)
  const comp = companeroDe(u)
  const elementos = comp ? await elementosDe(comp.id) : []
  const j = estado.jefe
  if (!j || Date.now() >= j.expira) return { ok: false, motivo: 'sin-jefe', proximo: estado.proximo }

  const def = defJefe(j.id)
  const g = danio(u.level, comp?.level ?? 0, Math.random, bonoArma(u.arma?.nivel ?? 0))

  // Sinergia: el golpe anterior, de OTRO jugador, reciente y sin usar.
  const ahora = Date.now()
  const prev = j.ultimo
  const r = prev && prev.jid !== sender && !prev.usado && ahora - prev.ts <= VENTANA_REACCION
    ? reaccion(prev.elementos, elementos)
    : null
  if (r && prev) prev.usado = true
  j.ultimo = { jid: sender, elementos, ts: ahora, usado: r !== null }
  const conReaccion = r && prev ? { ...r, con: prev.jid } : null

  const bono = bonoCuidado(u, ahora)
  const total = Math.round(g.danio * (r?.mult ?? 1) * bono.danio)
  const pegado = Math.min(total, j.vida)

  j.vida -= pegado
  j.golpes++
  j.danios[sender] = (j.danios[sender] ?? 0) + pegado
  if (!j.grupos.includes(gjid)) j.grupos.push(gjid)
  const frase = def.frases[Math.floor(Math.random() * def.frases.length)]!

  if (j.vida > 0) {
    // Sigue en pie: puede devolver el golpe. El que lo remata no lo recibe.
    const contra = contraataque(Math.random, bono.defensa)
    const salud = contra ? herir(u, contra, ahora) : saludDe(u, ahora)
    guardar()
    return {
      ok: true, danio: total, critico: g.critico, frase, jefe: j, premios: null, texto: '', elementos, reaccion: conReaccion,
      contra, salud, cuidados: bono.atendidos,
    }
  }

  // Cayó.
  const premios = repartir(j.danios, j.vidaMax, sender)
  pagar(premios)
  estado.jefe = null
  estado.participantesAnterior = premios.length
  estado.proximo = proximaAparicion()
  guardar()
  armar()

  const texto = [
    `╭─「 ${def.emoji} ¡JEFE DERROTADO! 」`,
    `│`,
    `│ *${def.nombre}* cayó tras ${j.golpes} golpes de ${premios.length} jugador(es).`,
    `│`,
    ...tabla(premios),
    premios.length > 5 ? `│ …y ${premios.length - 5} más` : '',
    `╰─ El próximo aparece en unas ${Math.round(CADA / 3_600_000)} h`,
  ].filter(Boolean).join('\n')
  // El grupo del remate lo recibe como respuesta del comando; los demás, acá.
  void avisar([...j.grupos, ...estado.grupos], texto, premios.slice(0, 5).map(p => p.jid), gjid)
  return {
    ok: true, danio: total, critico: g.critico, frase, jefe: j, premios, texto, elementos, reaccion: conReaccion,
    contra: 0, salud: saludDe(u, ahora), cuidados: bono.atendidos,
  }
}

export function jefeActual(): JefeVivo | null {
  const j = estado.jefe
  return j && Date.now() < j.expira ? j : null
}

export const proximoJefe = () => estado.proximo

export function avisosActivos(gjid: string): boolean {
  return estado.grupos.includes(gjid)
}

export function setAvisos(gjid: string, on: boolean): void {
  estado.grupos = estado.grupos.filter(g => g !== gjid)
  if (on) estado.grupos.push(gjid)
  guardar()
}

export { barra }

/** Llamar en cada 'ready': guarda el socket vivo y arma el temporizador. */
export function setupRaids(sock: WASocket): void {
  sockRef = sock
  if (!estado.jefe && !estado.proximo) {
    estado.proximo = proximaAparicion()
    guardar()
  }
  armar()
}
