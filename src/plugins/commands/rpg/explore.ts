import type { Command } from '../../../types/index.js'
import { getUserData, checkLevelUp, fmtCooldown } from '@core/events.js'
import { safeSend, sendCritical } from '@lib/media_sender.js'
import { enData, leerJson, guardarJson, esObjeto } from '@lib/jsonFile.js'
import { saludDe, herir, curar, MIN_PELEAR, MAX } from '@lib/health.js'
import { tx } from '@lib/i18n.js'
import {
  generar, nuevaTemporada, mover, repartoReliquia, progreso, deTexto, DIRECCION,
  type Exploracion, type Mapa,
} from '@lib/exploration.js'
import { recorte, imagenMapa } from '@lib/explorationMap.js'

// #explorar: la cueva del grupo (ver exploration.ts). Una ficha para todo el
// grupo; cada uno mueve cuando quiere, con su propia espera, y lo que aparece
// le toca a quien dio el paso. Encontrar la reliquia reparte una bolsa entre
// todos los que exploraron y abre una cueva nueva.
//
// Se guarda en data/exploration.json: por grupo, la temporada, la posición y
// dos bitsets de 200 bytes. El mapa no, sale de la semilla.

const ARCHIVO = enData('exploration.json')
/** Entre paso y paso de una misma persona. */
const ESPERA = 60_000
/** Entre paso y paso del grupo, para que dos mensajes juntos no se pisen. */
const ESPERA_GRUPO = 3_000

const estado: Record<string, Exploracion> = leerJson(ARCHIVO, {}, esObjeto)
const guardar = () => guardarJson(ARCHIVO, estado)
const ultimo = new Map<string, number>()
const ultimoGrupo = new Map<string, number>()

// Generar es ~0,1 ms, pero el mismo grupo pide el mismo mapa en cada paso.
const mapas = new Map<number, Mapa>()
function mapaDe(semilla: number): Mapa {
  let m = mapas.get(semilla)
  if (!m) {
    if (mapas.size >= 32) mapas.delete(mapas.keys().next().value!)
    m = generar(semilla)
    mapas.set(semilla, m)
  }
  return m
}

const T = {
  titulo:    { es: 'CUEVA · TEMPORADA {t}', en: 'CAVE · SEASON {t}', pt: 'CAVERNA · TEMPORADA {t}' },
  pie:       { es: '{p}% explorado', en: '{p}% explored', pt: '{p}% explorado' },
  ayuda:     { es: '> Moverse: `{p}explorar n|s|e|o` · ver todo: `{p}explorar mapa`', en: '> Move: `{p}explorar n|s|e|o` · see it all: `{p}explorar mapa`', pt: '> Mover: `{p}explorar n|s|e|o` · ver tudo: `{p}explorar mapa`' },
  intro:     { es: '🧭 Una cueva para todo el grupo. Busquen la 🏺 reliquia: al encontrarla se reparte ¥ entre todos los que exploraron.', en: '🧭 One cave for the whole group. Find the 🏺 relic: whoever explored splits the ¥.', pt: '🧭 Uma caverna para o grupo todo. Achem a 🏺 relíquia: quem explorou divide os ¥.' },
  espera:    { es: '> ⏳ Descansá un poco: podés moverte en {t}.', en: '> ⏳ Rest a bit: you can move in {t}.', pt: '> ⏳ Descanse um pouco: você pode se mover em {t}.' },
  grupo:     { es: '> ⏳ El grupo todavía está dando el paso anterior.', en: '> ⏳ The group is still taking the last step.', pt: '> ⏳ O grupo ainda está dando o passo anterior.' },
  herido:    { es: '> 🤕 Estás muy herido para explorar (❤ {h}, mínimo {m}). `{p}salud`', en: '> 🤕 Too hurt to explore (❤ {h}, minimum {m}). `{p}salud`', pt: '> 🤕 Muito ferido para explorar (❤ {h}, mínimo {m}). `{p}salud`' },
  pared:     { es: '🧱 Una pared. Por ahí no se pasa.', en: '🧱 A wall. No way through.', pt: '🧱 Uma parede. Por aí não passa.' },
  nada:      { es: '👣 Nada por aquí.', en: '👣 Nothing here.', pt: '👣 Nada por aqui.' },
  tesoro:    { es: '💰 ¡Un cofre! +¥{d}', en: '💰 A chest! +¥{d}', pt: '💰 Um baú! +¥{d}' },
  trampa:    { es: '🕳️ ¡Una trampa! -{h} ❤ (te queda {r})', en: '🕳️ A trap! -{h} ❤ ({r} left)', pt: '🕳️ Uma armadilha! -{h} ❤ (resta {r})' },
  monstruo:  { es: '👹 Un monstruo: lo venciste, pero te pegó -{h} ❤ (te queda {r}). +¥{d} y +{x} exp', en: '👹 A monster: you won, but it hit you -{h} ❤ ({r} left). +¥{d} and +{x} exp', pt: '👹 Um monstro: você venceu, mas levou -{h} ❤ (resta {r}). +¥{d} e +{x} exp' },
  fuente:    { es: '⛲ Una fuente: +{h} ❤ (ahora {r})', en: '⛲ A fountain: +{h} ❤ (now {r})', pt: '⛲ Uma fonte: +{h} ❤ (agora {r})' },
  secreta:   { es: '🚪 ¡La pared cedió! Una sala secreta: +¥{d}', en: '🚪 The wall gave way! A secret room: +¥{d}', pt: '🚪 A parede cedeu! Uma sala secreta: +¥{d}' },
  reliquia:  { es: '🏺 *¡LA RELIQUIA!* @{q} la encontró. La cueva se derrumba y se abre otra.', en: '🏺 *THE RELIC!* @{q} found it. The cave collapses and a new one opens.', pt: '🏺 *A RELÍQUIA!* @{q} encontrou. A caverna desaba e outra se abre.' },
  cobro:     { es: '│ @{j}: +¥{d} ({n} pasos)', en: '│ @{j}: +¥{d} ({n} steps)', pt: '│ @{j}: +¥{d} ({n} passos)' },
  nuevas:    { es: ' · {n} casillas nuevas', en: ' · {n} new tiles', pt: ' · {n} casas novas' },
  error:     { es: '> No pude dibujar el mapa ahora.', en: '> I couldn\'t draw the map right now.', pt: '> Não consegui desenhar o mapa agora.' },
}

const command: Command = {
  name:        'explorar',
  aliases:     ['explore', 'cueva', 'cave', 'caverna'],
  description: 'La cueva del grupo con niebla: muévanse entre todos y busquen la reliquia  |  !explorar [n|s|e|o|mapa]',
  category:    'rpg',
  cooldown:    2,
  groupOnly:   true,

  async execute({ sock, jid, msg, sender, pushName, args, prefix, lang }) {
    const responder = (text: string) => safeSend(() => sock.sendMessage(jid, { text }, { quoted: msg }))
    const e = estado[jid] ??= nuevaTemporada(jid, 1)
    const mapa = mapaDe(e.semilla)
    const sub = (args[0] ?? '').toLowerCase()
    const dir = DIRECCION[sub]
    const pie = () => tx(lang, T.pie, { p: Math.round(progreso(mapa, deTexto(e.vistas)) * 100) })

    // ─── !explorar / !explorar mapa: dónde está el grupo ───────────────────
    if (!dir) {
      if (['mapa', 'map', 'ver', 'todo'].includes(sub)) {
        try {
          const img = await imagenMapa(mapa, e.pos, deTexto(e.vistas), deTexto(e.usadas), tx(lang, T.titulo, { t: e.temporada }), pie())
          await safeSend(() => sock.sendMessage(jid, { image: img, caption: tx(lang, T.ayuda, { p: prefix }) }, { quoted: msg }))
        } catch {
          await responder(tx(lang, T.error))
        }
        return
      }
      await responder([
        `╭─「 🧭 ${tx(lang, T.titulo, { t: e.temporada })} 」`,
        `│ ${pie()}`,
        `╰─`,
        recorte(mapa, e.pos, deTexto(e.vistas), deTexto(e.usadas)),
        ``,
        tx(lang, T.intro),
        tx(lang, T.ayuda, { p: prefix }),
      ].join('\n'))
      return
    }

    // ─── !explorar <dirección>: un paso ────────────────────────────────────
    const ahora = Date.now()
    const falta = (ultimo.get(sender) ?? 0) + ESPERA - ahora
    if (falta > 0) return void await responder(tx(lang, T.espera, { t: fmtCooldown(falta) }))
    if ((ultimoGrupo.get(jid) ?? 0) + ESPERA_GRUPO > ahora) return void await responder(tx(lang, T.grupo))
    const u = getUserData(sender, pushName)
    const salud = saludDe(u, ahora)
    if (salud < MIN_PELEAR) return void await responder(tx(lang, T.herido, { h: salud, m: MIN_PELEAR, p: prefix }))

    const ev = mover(e, mapa, sender, dir)
    // Contra una pared no se gasta la espera: no pasó nada.
    if (ev.tipo === 'pared') {
      guardar()
      return void await responder(tx(lang, T.pared))
    }
    ultimo.set(sender, ahora)
    ultimoGrupo.set(jid, ahora)

    // Todo lo de `u` antes de cualquier await: después puede ser otro objeto.
    let linea: string
    switch (ev.tipo) {
      case 'tesoro':
      case 'secreta':
        u.money += ev.dinero
        linea = tx(lang, T[ev.tipo], { d: ev.dinero.toLocaleString('de-DE') })
        break
      case 'trampa':
        linea = tx(lang, T.trampa, { h: ev.danio, r: herir(u, ev.danio, ahora) })
        break
      case 'monstruo':
        u.money += ev.dinero
        u.exp += ev.exp
        linea = tx(lang, T.monstruo, { h: ev.danio, r: herir(u, ev.danio, ahora), d: ev.dinero.toLocaleString('de-DE'), x: ev.exp })
        break
      case 'fuente': {
        const antes = saludDe(u, ahora)
        const r = curar(u, ev.cura, ahora)
        linea = tx(lang, T.fuente, { h: r - antes, r: `${r}/${MAX}` })
        break
      }
      case 'reliquia': {
        const reparto = repartoReliquia(e.pasos, sender)
        for (const [j, d] of Object.entries(reparto)) {
          const v = getUserData(j)
          v.money += d
          v.exp += Math.round(d * 0.1)
          checkLevelUp(j)
        }
        const pasos = e.pasos
        estado[jid] = nuevaTemporada(jid, e.temporada + 1)
        guardar()
        const quienes = Object.keys(reparto)
        // El dinero ya se movió: con garantía de entrega.
        await sendCritical(sock, jid, {
          text: [
            tx(lang, T.reliquia, { q: sender.split('@')[0]! }),
            `╭─`,
            ...Object.entries(reparto).sort((a, b) => b[1] - a[1]).map(([j, d]) =>
              tx(lang, T.cobro, { j: j.split('@')[0]!, d: d.toLocaleString('de-DE'), n: pasos[j] ?? 0 })),
            `╰─`,
          ].join('\n'),
          mentions: quienes,
        }, { quoted: msg })
        return
      }
      default:
        linea = tx(lang, T.nada)
    }
    if (ev.tipo === 'monstruo') checkLevelUp(sender)
    guardar()

    await responder([
      linea + (ev.nuevas ? tx(lang, T.nuevas, { n: ev.nuevas }) : ''),
      ``,
      recorte(mapa, e.pos, deTexto(e.vistas), deTexto(e.usadas)),
      `> ${pie()}`,
    ].join('\n'))
  },
}

export default command
