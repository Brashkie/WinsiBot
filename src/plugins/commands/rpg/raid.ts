import type { Command } from '../../../types/index.js'
import {
  getUserData, isOnCooldown, setCooldown, getCooldownLeft, fmtCooldown,
} from '@core/events.js'
import { safeSend, sendCritical } from '@lib/media_sender.js'
import { winsiStore } from '@core/store.js'
import { ELEMENTO, VENTANA_REACCION } from '@lib/raid.js'
import {
  atacar, aparecer, jefeActual, proximoJefe, avisosActivos, setAvisos, defJefe, barra,
} from '@lib/raidWorld.js'
import { horaLocal } from '@lib/utils.js'
import { saludDe, esperaHasta, MIN_PELEAR, MAX as SALUD_MAX } from '@lib/health.js'
import { tx } from '@lib/i18n.js'

// Ver raidWorld.ts: un solo jefe para todos los grupos.
//
// Los nombres de los jefes, sus frases, los elementos y las reacciones siguen
// en español: son nombres propios del juego. En inglés y portugués el golpe
// sale sin la frase, que suelta en medio de otro idioma quedaba rara.

const CD = 60_000   // un golpe por minuto por jugador

const T = {
  sinJefe:   { es: '> No hay ningún jefe ahora. El próximo aparece cerca de las *{h}*.', en: '> There is no boss right now. The next one shows up around *{h}*.', pt: '> Não há nenhum chefe agora. O próximo aparece por volta de *{h}*.' },
  aliento:   { es: '> ⏳ Recuperando el aliento: *{t}*.', en: '> ⏳ Catching your breath: *{t}*.', pt: '> ⏳ Recuperando o fôlego: *{t}*.' },
  herido:    { es: '> 🤕 Estás muy herido para pelear (❤ {s}/{max}).', en: '> 🤕 You are too hurt to fight (❤ {s}/{max}).', pt: '> 🤕 Você está ferido demais para lutar (❤ {s}/{max}).' },
  curarte:   { es: '> Te recuperás solo en *{t}*, o: `{p}curar` (una poción) · `{p}hospital`', en: '> You recover on your own in *{t}*, or: `{p}curar` (a potion) · `{p}hospital`', pt: '> Você se recupera sozinho em *{t}*, ou: `{p}curar` (uma poção) · `{p}hospital`' },
  seFue:     { es: '> El jefe ya no está. El próximo aparece cerca de las *{h}*.', en: '> The boss is gone. The next one shows up around *{h}*.', pt: '> O chefe já foi. O próximo aparece por volta de *{h}*.' },
  sinergia:  { es: '✨ *¡{r}!* {a} de {quien} + {b} tuyo: ×{x}\n', en: '✨ *{r}!* {quien}\'s {a} + your {b}: ×{x}\n', pt: '✨ *{r}!* {a} de {quien} + {b} seu: ×{x}\n' },
  final:     { es: '🗡️ @{n} le dio el golpe final (*{d}*{c}).', en: '🗡️ @{n} landed the final blow (*{d}*{c}).', pt: '🗡️ @{n} deu o golpe final (*{d}*{c}).' },
  critico:   { es: ' ¡CRÍTICO!', en: ' CRITICAL!', pt: ' CRÍTICO!' },
  criticoG:  { es: '💥 *¡CRÍTICO!* ', en: '💥 *CRITICAL!* ', pt: '💥 *CRÍTICO!* ' },
  golpe:     { es: 'Golpeaste a *{j}* por *{d}*: {f}.', en: 'You hit *{j}* for *{d}*.', pt: 'Você acertou *{j}* com *{d}*.' },
  contra:    { es: '🩸 {j} te devolvió el golpe: *-{d}* ❤ (te quedan {s}/{max})', en: '🩸 {j} hit you back: *-{d}* ❤ ({s}/{max} left)', pt: '🩸 {j} revidou: *-{d}* ❤ (restam {s}/{max})' },
  curate:    { es: ' — curate antes de volver: `{p}curar` o `{p}hospital`', en: ' — heal before going back: `{p}curar` or `{p}hospital`', pt: ' — cure-se antes de voltar: `{p}curar` ou `{p}hospital`' },
  tuDanio:   { es: '> Tu daño total: {d}', en: '> Your total damage: {d}', pt: '> Seu dano total: {d}' },
  cuidado:   { es: '  ·  🐉 compañero cuidado: +{n}%', en: '  ·  🐉 well-kept companion: +{n}%', pt: '  ·  🐉 companheiro bem cuidado: +{n}%' },
  elementos: { es: '> Tus elementos: {e} — si otro golpea en {m} min con uno que combine, hay reacción', en: '> Your elements: {e} — if someone else hits within {m} min with one that combines, there is a reaction', pt: '> Seus elementos: {e} — se outro bater em {m} min com um que combine, há reação' },
  soloAdmin: { es: '> Solo los administradores pueden cambiar los avisos de raid.', en: '> Only admins can change the raid announcements.', pt: '> Só os administradores podem mudar os avisos de raid.' },
  avisosOn:  { es: '✅ Avisos de raid *activados*: este grupo verá cuando aparece un jefe y cómo termina.', en: '✅ Raid announcements *on*: this group will see when a boss shows up and how it ends.', pt: '✅ Avisos de raid *ligados*: este grupo vai ver quando um chefe aparece e como termina.' },
  avisosOff: { es: '🚫 Avisos de raid *desactivados*. Igual se puede pelear con `{p}raid atacar`.', en: '🚫 Raid announcements *off*. You can still fight with `{p}raid atacar`.', pt: '🚫 Avisos de raid *desligados*. Ainda dá pra lutar com `{p}raid atacar`.' },
  soloOwner: { es: '> Solo el dueño del bot puede invocar un jefe.', en: '> Only the bot owner can summon a boss.', pt: '> Só o dono do bot pode invocar um chefe.' },
  yaHay:     { es: '> Ya hay un jefe en pie.', en: '> There is already a boss standing.', pt: '> Já há um chefe de pé.' },
  invocado:  { es: '✅ Jefe invocado. `{p}raid` para verlo.', en: '✅ Boss summoned. `{p}raid` to see it.', pt: '✅ Chefe invocado. `{p}raid` para ver.' },
  noHay:     { es: '│ No hay jefe ahora.', en: '│ No boss right now.', pt: '│ Nenhum chefe agora.' },
  proximo:   { es: '│ El próximo aparece cerca de las *{h}*.', en: '│ The next one shows up around *{h}*.', pt: '│ O próximo aparece por volta de *{h}*.' },
  avisos:    { es: '│ Avisos en este grupo: {v}  (`{p}raid on/off`)', en: '│ Announcements in this group: {v}  (`{p}raid on/off`)', pt: '│ Avisos neste grupo: {v}  (`{p}raid on/off`)' },
  mundo:     { es: 'JEFE DE MUNDO', en: 'WORLD BOSS', pt: 'CHEFE MUNDIAL' },
  escapa:    { es: '│ ⏳ Se escapa en {m} min · {g} golpes', en: '│ ⏳ Escapes in {m} min · {g} hits', pt: '│ ⏳ Foge em {m} min · {g} golpes' },
  masDanio:  { es: '│ *Más daño:*', en: '│ *Most damage:*', pt: '│ *Mais dano:*' },
  nadie:     { es: '│ Nadie lo golpeó todavía.', en: '│ Nobody has hit it yet.', pt: '│ Ninguém bateu nele ainda.' },
  tuyo:      { es: '│ Tu daño: {d}', en: '│ Your damage: {d}', pt: '│ Seu dano: {d}' },
  pie:       { es: '╰─ `{p}raid atacar` (o `{p}atacar`), uno por minuto', en: '╰─ `{p}raid atacar` (or `{p}atacar`), one per minute', pt: '╰─ `{p}raid atacar` (ou `{p}atacar`), um por minuto' },
}

const command: Command = {
  name:        'raid',
  aliases:     ['jefe', 'boss', 'worldboss', 'atacar'],
  description: 'Jefe de mundo: todos los grupos contra el mismo  |  !raid  ·  !raid atacar  ·  !raid on/off',
  category:    'rpg',
  cooldown:    2,
  groupOnly:   true,

  async execute({ sock, jid, msg, sender, args, prefix, isAdmin, isOwner, command: usado, lang }) {
    const sub = (usado === 'atacar' ? 'atacar' : (args[0] ?? '')).toLowerCase()
    const responder = (text: string, mentions: string[] = []) =>
      safeSend(() => sock.sendMessage(jid, { text, mentions }, { quoted: msg }))
    const p = prefix

    // ─── !raid atacar ──────────────────────────────────────────────────────
    if (sub === 'atacar' || sub === 'attack' || sub === 'a' || sub === 'golpe') {
      if (!jefeActual()) {
        await responder(tx(lang, T.sinJefe, { h: horaLocal(proximoJefe()) }))
        return
      }
      if (isOnCooldown(sender, 'lastDungeon', CD)) {
        await responder(tx(lang, T.aliento, { t: fmtCooldown(getCooldownLeft(sender, 'lastDungeon', CD)) }))
        return
      }
      // Antes del cooldown: herido no gasta el golpe.
      const salud = saludDe(getUserData(sender))
      if (salud < MIN_PELEAR) {
        await responder([
          tx(lang, T.herido, { s: salud, max: SALUD_MAX }),
          tx(lang, T.curarte, { t: fmtCooldown(esperaHasta(getUserData(sender), MIN_PELEAR)), p }),
        ].join('\n'))
        return
      }
      setCooldown(sender, 'lastDungeon')

      const r = await atacar(sender, jid)
      if (!r.ok) {
        await responder(tx(lang, T.seFue, { h: horaLocal(r.proximo) }))
        return
      }
      const def = defJefe(r.jefe.id)
      // Nombre y no mención: combinar no tiene que notificar al otro cada vez.
      const sinergia = r.reaccion
        ? tx(lang, T.sinergia, {
            r: r.reaccion.nombre,
            a: ELEMENTO[r.reaccion.elementos[0]] ?? r.reaccion.elementos[0],
            b: ELEMENTO[r.reaccion.elementos[1]] ?? r.reaccion.elementos[1],
            quien: winsiStore.getName(r.reaccion.con),
            x: r.reaccion.mult,
          })
        : ''

      if (r.premios) {
        // El saldo ya se movió: con garantía de entrega.
        await sendCritical(sock, jid, {
          text: `${sinergia}${tx(lang, T.final, { n: sender.split('@')[0], d: r.danio.toLocaleString(), c: r.critico ? tx(lang, T.critico) : '' })}\n\n${r.texto}`,
          mentions: [sender, ...r.premios.slice(0, 5).map(p => p.jid)],
        }, { quoted: msg })
        return
      }

      await responder([
        `${sinergia}${def.emoji} ${r.critico ? tx(lang, T.criticoG) : ''}${tx(lang, T.golpe, { j: def.nombre, d: r.danio.toLocaleString(), f: r.frase })}`,
        `❤ ${barra(r.jefe.vida, r.jefe.vidaMax)} ${r.jefe.vida.toLocaleString()}/${r.jefe.vidaMax.toLocaleString()}`,
        r.contra
          ? tx(lang, T.contra, { j: def.nombre, d: r.contra, s: r.salud, max: SALUD_MAX }) + (r.salud < MIN_PELEAR ? tx(lang, T.curate, { p }) : '')
          : '',
        tx(lang, T.tuDanio, { d: (r.jefe.danios[sender] ?? 0).toLocaleString() }) + (r.cuidados ? tx(lang, T.cuidado, { n: r.cuidados * 5 }) : ''),
        r.elementos.length && !r.reaccion
          ? tx(lang, T.elementos, { e: r.elementos.map(e => ELEMENTO[e] ?? e).join(' '), m: VENTANA_REACCION / 60_000 })
          : '',
      ].filter(Boolean).join('\n'))
      return
    }

    // ─── !raid on / off (admins) ───────────────────────────────────────────
    if (['on', 'off', 'activar', 'desactivar'].includes(sub)) {
      if (!isAdmin && !isOwner) {
        await responder(tx(lang, T.soloAdmin))
        return
      }
      const on = sub === 'on' || sub === 'activar'
      setAvisos(jid, on)
      await responder(on ? tx(lang, T.avisosOn) : tx(lang, T.avisosOff, { p }))
      return
    }

    // ─── !raid invocar (owner) ─────────────────────────────────────────────
    if (sub === 'invocar' || sub === 'spawn') {
      if (!isOwner) {
        await responder(tx(lang, T.soloOwner))
        return
      }
      if (!(await aparecer())) {
        await responder(tx(lang, T.yaHay))
        return
      }
      // Si este grupo tiene los avisos activados, el anuncio ya llegó.
      if (!avisosActivos(jid)) await responder(tx(lang, T.invocado, { p }))
      return
    }

    // ─── !raid — el estado ─────────────────────────────────────────────────
    const j = jefeActual()
    if (!j) {
      await responder([
        `╭─「 ⚔️ RAID 」`,
        `│`,
        tx(lang, T.noHay),
        tx(lang, T.proximo, { h: horaLocal(proximoJefe()) }),
        `│`,
        tx(lang, T.avisos, { v: avisosActivos(jid) ? '✅' : '❌', p }),
        `╰─`,
      ].join('\n'))
      return
    }

    const def = defJefe(j.id)
    const top = Object.entries(j.danios).sort((a, b) => b[1] - a[1]).slice(0, 5)
    const mio = j.danios[sender] ?? 0
    const quedan = Math.max(0, Math.round((j.expira - Date.now()) / 60_000))
    await responder([
      `╭─「 ${def.emoji} ${tx(lang, T.mundo)} 」`,
      `│`,
      `│ *${def.nombre}*`,
      `│ ❤ ${barra(j.vida, j.vidaMax)} ${j.vida.toLocaleString()}/${j.vidaMax.toLocaleString()}`,
      tx(lang, T.escapa, { m: quedan, g: j.golpes }),
      `│`,
      ...(top.length
        // Nombres, no menciones: consultar el estado no tiene que notificar a nadie.
        ? [tx(lang, T.masDanio), ...top.map(([s, d], i) => `│ ${i + 1}. ${winsiStore.getName(s)}  ${d.toLocaleString()}`)]
        : [tx(lang, T.nadie)]),
      `│`,
      tx(lang, T.tuyo, { d: mio.toLocaleString() }),
      tx(lang, T.pie, { p }),
    ].join('\n'))
  },
}

export default command
