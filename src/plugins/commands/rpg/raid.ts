import type { Command } from '../../../types/index.js'
import {
  isOnCooldown, setCooldown, getCooldownLeft, fmtCooldown,
} from '@core/events.js'
import { safeSend, sendCritical } from '@lib/media_sender.js'
import { winsiStore } from '@core/store.js'
import { ELEMENTO, VENTANA_REACCION } from '@lib/raid.js'
import {
  atacar, aparecer, jefeActual, proximoJefe, avisosActivos, setAvisos, defJefe, barra,
} from '@lib/raidWorld.js'
import { horaLocal } from '@lib/utils.js'

// Ver raidWorld.ts: un solo jefe para todos los grupos.

const CD = 60_000   // un golpe por minuto por jugador

const command: Command = {
  name:        'raid',
  aliases:     ['jefe', 'boss', 'worldboss', 'atacar'],
  description: 'Jefe de mundo: todos los grupos contra el mismo  |  !raid  ·  !raid atacar  ·  !raid on/off',
  category:    'rpg',
  cooldown:    2,
  groupOnly:   true,

  async execute({ sock, jid, msg, sender, args, prefix, isAdmin, isOwner, command: usado }) {
    const sub = (usado === 'atacar' ? 'atacar' : (args[0] ?? '')).toLowerCase()
    const responder = (text: string, mentions: string[] = []) =>
      safeSend(() => sock.sendMessage(jid, { text, mentions }, { quoted: msg }))

    // ─── !raid atacar ──────────────────────────────────────────────────────
    if (sub === 'atacar' || sub === 'attack' || sub === 'a' || sub === 'golpe') {
      if (!jefeActual()) {
        await responder(`> No hay ningún jefe ahora. El próximo aparece cerca de las *${horaLocal(proximoJefe())}*.`)
        return
      }
      if (isOnCooldown(sender, 'lastDungeon', CD)) {
        await responder(`> ⏳ Recuperando el aliento: *${fmtCooldown(getCooldownLeft(sender, 'lastDungeon', CD))}*.`)
        return
      }
      setCooldown(sender, 'lastDungeon')

      const r = await atacar(sender, jid)
      if (!r.ok) {
        await responder(`> El jefe ya no está. El próximo aparece cerca de las *${horaLocal(r.proximo)}*.`)
        return
      }
      const def = defJefe(r.jefe.id)
      // Nombre y no mención: combinar no tiene que notificar al otro cada vez.
      const sinergia = r.reaccion
        ? `✨ *¡${r.reaccion.nombre}!* ${ELEMENTO[r.reaccion.elementos[0]] ?? r.reaccion.elementos[0]} de ${winsiStore.getName(r.reaccion.con)} + ${ELEMENTO[r.reaccion.elementos[1]] ?? r.reaccion.elementos[1]} tuyo: ×${r.reaccion.mult}\n`
        : ''

      if (r.premios) {
        // El saldo ya se movió: con garantía de entrega.
        await sendCritical(sock, jid, {
          text: `${sinergia}🗡️ @${sender.split('@')[0]} le dio el golpe final (*${r.danio.toLocaleString()}*${r.critico ? ' ¡CRÍTICO!' : ''}).\n\n${r.texto}`,
          mentions: [sender, ...r.premios.slice(0, 5).map(p => p.jid)],
        }, { quoted: msg })
        return
      }

      await responder([
        `${sinergia}${def.emoji} ${r.critico ? '💥 *¡CRÍTICO!* ' : ''}Golpeaste a *${def.nombre}* por *${r.danio.toLocaleString()}*: ${r.frase}.`,
        `❤ ${barra(r.jefe.vida, r.jefe.vidaMax)} ${r.jefe.vida.toLocaleString()}/${r.jefe.vidaMax.toLocaleString()}`,
        `> Tu daño total: ${(r.jefe.danios[sender] ?? 0).toLocaleString()}`,
        r.elementos.length && !r.reaccion
          ? `> Tus elementos: ${r.elementos.map(e => ELEMENTO[e] ?? e).join(' ')} — si otro golpea en ${VENTANA_REACCION / 60_000} min con uno que combine, hay reacción`
          : '',
      ].filter(Boolean).join('\n'))
      return
    }

    // ─── !raid on / off (admins) ───────────────────────────────────────────
    if (['on', 'off', 'activar', 'desactivar'].includes(sub)) {
      if (!isAdmin && !isOwner) {
        await responder(`> Solo los administradores pueden cambiar los avisos de raid.`)
        return
      }
      const on = sub === 'on' || sub === 'activar'
      setAvisos(jid, on)
      await responder(on
        ? `✅ Avisos de raid *activados*: este grupo verá cuando aparece un jefe y cómo termina.`
        : `🚫 Avisos de raid *desactivados*. Igual se puede pelear con \`${prefix}raid atacar\`.`)
      return
    }

    // ─── !raid invocar (owner) ─────────────────────────────────────────────
    if (sub === 'invocar' || sub === 'spawn') {
      if (!isOwner) {
        await responder(`> Solo el dueño del bot puede invocar un jefe.`)
        return
      }
      if (!(await aparecer())) {
        await responder(`> Ya hay un jefe en pie.`)
        return
      }
      // Si este grupo tiene los avisos activados, el anuncio ya llegó.
      if (!avisosActivos(jid)) await responder(`✅ Jefe invocado. \`${prefix}raid\` para verlo.`)
      return
    }

    // ─── !raid — el estado ─────────────────────────────────────────────────
    const j = jefeActual()
    if (!j) {
      await responder([
        `╭─「 ⚔️ RAID 」`,
        `│`,
        `│ No hay jefe ahora.`,
        `│ El próximo aparece cerca de las *${horaLocal(proximoJefe())}*.`,
        `│`,
        `│ Avisos en este grupo: ${avisosActivos(jid) ? '✅' : '❌'}  (\`${prefix}raid on/off\`)`,
        `╰─`,
      ].join('\n'))
      return
    }

    const def = defJefe(j.id)
    const top = Object.entries(j.danios).sort((a, b) => b[1] - a[1]).slice(0, 5)
    const mio = j.danios[sender] ?? 0
    const quedan = Math.max(0, Math.round((j.expira - Date.now()) / 60_000))
    await responder([
      `╭─「 ${def.emoji} JEFE DE MUNDO 」`,
      `│`,
      `│ *${def.nombre}*`,
      `│ ❤ ${barra(j.vida, j.vidaMax)} ${j.vida.toLocaleString()}/${j.vidaMax.toLocaleString()}`,
      `│ ⏳ Se escapa en ${quedan} min · ${j.golpes} golpes`,
      `│`,
      ...(top.length
        // Nombres, no menciones: consultar el estado no tiene que notificar a nadie.
        ? [`│ *Más daño:*`, ...top.map(([s, d], i) => `│ ${i + 1}. ${winsiStore.getName(s)}  ${d.toLocaleString()}`)]
        : [`│ Nadie lo golpeó todavía.`]),
      `│`,
      `│ Tu daño: ${mio.toLocaleString()}`,
      `╰─ \`${prefix}raid atacar\` (o \`${prefix}atacar\`), uno por minuto`,
    ].join('\n'))
  },
}

export default command
