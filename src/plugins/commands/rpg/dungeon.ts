import type { Command } from '../../../types/index.js'
import { safeSend, sendCritical } from '@lib/media_sender.js'
import { NIVELES, VIDA_MAX, SI_CAEN, POR_TERMINAR } from '@lib/dungeon.js'
import {
  abrir, abrirPuerta, deHoy, retirarse, ranking, salasDelNivel, poderGrupo,
  type Cobro, type Expedicion,
} from '@lib/expeditions.js'
import { barra } from '@lib/raid.js'

// La mazmorra del día: ver dungeon.ts (el mapa y las reglas) y
// expeditions.ts (una por grupo y por día).

const ESPERA_GRUPO = 10_000   // entre puerta y puerta, para que no se pisen
const ultimoPaso = new Map<string, number>()

function estado(e: Expedicion, prefix: string): string {
  const salas = salasDelNivel(e)
  return [
    `│ Nivel *${e.nivel + 1}/${NIVELES}*  ·  ❤ ${barra(e.vida, VIDA_MAX)} ${e.vida}/${VIDA_MAX}`,
    `│ Botín: ¥${e.botin.toLocaleString()}  ·  poder del grupo: ${poderGrupo(e.participantes)}  ·  ${e.participantes.length} aventurero(s)`,
    `│`,
    ...salas.map((s, i) => `│ 🚪 *${i + 1}* — _${s.pista}_`),
    `│`,
    `╰─ \`${prefix}mazmorra <número>\` para abrir una · \`${prefix}mazmorra salir\` para cobrar`,
  ].join('\n')
}

function cierre(c: Cobro): string {
  const que = {
    terminada: `🏆 *¡Mazmorra completada!* El botín vale ×${POR_TERMINAR}.`,
    retirada:  `🚶 *El grupo se retira* con todo el botín.`,
    caida:     `💀 *El grupo cayó.* Se rescata el ${Math.round(SI_CAEN * 100)}% del botín.`,
  }[c.como]
  return `${que}\n> Cada uno de los ${c.participantes.length}: +¥${c.porCabeza.toLocaleString()} y +${c.exp} exp`
}

const command: Command = {
  name:        'mazmorra',
  aliases:     ['dungeon', 'mazmorras', 'calabozo'],
  description: 'La mazmorra del día, la misma para todos los grupos  |  !mazmorra entrar · !mazmorra <puerta> · !mazmorra salir · !mazmorra ranking',
  category:    'rpg',
  cooldown:    2,
  groupOnly:   true,

  async execute({ sock, jid, msg, sender, args, prefix }) {
    const sub = (args[0] ?? '').toLowerCase()
    const responder = (text: string, mentions: string[] = []) =>
      safeSend(() => sock.sendMessage(jid, { text, mentions }, { quoted: msg }))

    // ─── !mazmorra entrar ──────────────────────────────────────────────────
    if (['entrar', 'iniciar', 'start', 'empezar'].includes(sub)) {
      const nombre = await sock.groupMetadata(jid).then(m => m.subject).catch(() => '')
      const r = abrir(jid, nombre, sender)
      if (!r.ok) {
        await responder(r.motivo === 'otro-grupo'
          ? `> Hoy ya bajaste a la mazmorra con otro grupo. Una expedición por día.`
          : r.e?.fin
            ? `> Este grupo ya hizo la mazmorra de hoy (llegó al nivel ${r.e.nivel}). Mañana hay otra.`
            : `> Ya hay una expedición en curso: \`${prefix}mazmorra\` para verla.`)
        return
      }
      await responder([
        `╭─「 🏰 MAZMORRA DEL DÍA 」`,
        `│`,
        `│ La misma para todos los grupos hoy: ${NIVELES} niveles y un jefe al final.`,
        `│ Cualquiera del grupo puede abrir una puerta y se suma a la expedición.`,
        `│ Si caen, se rescata el ${Math.round(SI_CAEN * 100)}% del botín; si se retiran, todo.`,
        `│`,
        estado(r.e, prefix),
      ].join('\n'))
      return
    }

    // ─── !mazmorra salir ───────────────────────────────────────────────────
    if (['salir', 'retirarse', 'cobrar', 'huir'].includes(sub)) {
      const c = retirarse(jid)
      if (!c) {
        await responder(`> No hay una expedición en curso.`)
        return
      }
      await sendCritical(sock, jid, { text: cierre(c), mentions: c.participantes }, { quoted: msg })
      return
    }

    // ─── !mazmorra ranking ─────────────────────────────────────────────────
    if (['ranking', 'top', 'tabla'].includes(sub)) {
      const r = ranking()
      if (!r.length) {
        await responder(`> Hoy nadie bajó todavía. \`${prefix}mazmorra entrar\``)
        return
      }
      const medallas = ['🥇', '🥈', '🥉']
      await responder([
        `╭─「 🏰 MAZMORRA DE HOY — RANKING 」`,
        `│`,
        ...r.slice(0, 10).map((e, i) =>
          `│ ${medallas[i] ?? `${i + 1}.`} *${e.nombreGrupo || 'Un grupo'}* — nivel ${e.nivel}/${NIVELES}` +
          `${e.fin === 'terminada' ? ' 🏆' : e.fin === 'caida' ? ' 💀' : e.fin ? '' : ' ⏳'} · ¥${e.botin.toLocaleString()}`),
        `╰─`,
      ].join('\n'))
      return
    }

    // ─── !mazmorra <puerta> ────────────────────────────────────────────────
    const puerta = parseInt(sub === 'puerta' ? (args[1] ?? '') : sub)
    if (Number.isInteger(puerta)) {
      const antes = ultimoPaso.get(jid) ?? 0
      if (Date.now() - antes < ESPERA_GRUPO) {
        await responder(`> ⏳ El grupo todavía se está recuperando de la sala anterior.`)
        return
      }
      const r = abrirPuerta(jid, sender, puerta)
      if (!r.ok) {
        await responder({
          'sin-expedicion': `> No hay expedición hoy en este grupo: \`${prefix}mazmorra entrar\``,
          terminada:        `> La expedición de hoy ya terminó. Mañana hay otra mazmorra.`,
          puerta:           `> Esa puerta no existe en este nivel.`,
          'otro-grupo':     `> Hoy ya bajaste a la mazmorra con otro grupo. Una expedición por día.`,
        }[r.motivo])
        return
      }
      ultimoPaso.set(jid, Date.now())
      const objeto = r.objetoPara ? ` (para @${r.objetoPara.split('@')[0]})` : ''
      if (r.cobro) {
        // El dinero ya se movió: con garantía de entrega.
        await sendCritical(sock, jid, {
          text: `🚪 Puerta ${puerta}: ${r.texto}${objeto}\n\n${cierre(r.cobro)}`,
          mentions: r.cobro.participantes,
        }, { quoted: msg })
        return
      }
      await responder(`🚪 Puerta ${puerta}: ${r.texto}${objeto}\n\n╭─「 🏰 MAZMORRA 」\n${estado(r.e, prefix)}`, r.objetoPara ? [r.objetoPara] : [])
      return
    }

    // ─── !mazmorra — el estado ─────────────────────────────────────────────
    const e = deHoy(jid)
    if (!e) {
      await responder([
        `╭─「 🏰 MAZMORRA DEL DÍA 」`,
        `│`,
        `│ Una mazmorra nueva cada día, la misma para todos los grupos.`,
        `│ ${NIVELES} niveles, puertas con pistas, y un jefe al final.`,
        `│ El poder del grupo sale del nivel, el compañero y el arma`,
        `│ de cada uno: al jefe no se le gana solo.`,
        `│`,
        `│ \`${prefix}mazmorra entrar\` · \`${prefix}mazmorra ranking\``,
        `╰─`,
      ].join('\n'))
      return
    }
    if (e.fin) {
      await responder(`> La expedición de hoy terminó en el nivel ${e.nivel}/${NIVELES}. \`${prefix}mazmorra ranking\` para comparar.`)
      return
    }
    await responder(`╭─「 🏰 MAZMORRA 」\n${estado(e, prefix)}`)
  },
}

export default command
