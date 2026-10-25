import type { Command } from '../../../types/index.js'
import { getUserData, patchUserData } from '@core/events.js'
import { safeSend } from '@lib/media_sender.js'
import {
  MAX_NIVEL, NIVEL_RIESGO, COSTO_PROTECCION,
  costo, probabilidad, intentar, bonoArma, faltante, type Costo,
} from '@lib/forge.js'

// Ver forge.ts: las reglas, y por qué existe.

function linea(c: Costo): string {
  return [
    c.espadas && `${c.espadas} ⚔️`,
    c.sp && `${c.sp} ✨`,
    c.legendarios && `${c.legendarios} 🏆`,
    `¥${c.dinero.toLocaleString()}`,
  ].filter(Boolean).join(' + ')
}

const command: Command = {
  name:        'forjar',
  aliases:     ['forja', 'forge', 'herreria', 'herrería'],
  description: 'Mejora tu arma de +0 a +10 (da daño en #raid)  |  !forjar  ·  !forjar mejorar  ·  !forjar proteccion',
  category:    'rpg',
  cooldown:    3,

  async execute({ sock, jid, msg, sender, pushName, args, prefix }) {
    const sub = (args[0] ?? '').toLowerCase()
    const responder = (text: string) => safeSend(() => sock.sendMessage(jid, { text }, { quoted: msg }))
    const u = getUserData(sender, pushName)
    const nivel = u.arma?.nivel ?? 0

    // ─── !forjar mejorar ───────────────────────────────────────────────────
    if (['mejorar', 'subir', 'up', '+'].includes(sub)) {
      if (nivel >= MAX_NIVEL) {
        await responder(`> Tu arma ya está en *+${MAX_NIVEL}*, el máximo.`)
        return
      }
      const c = costo(nivel)
      const falta = faltante(c, u.items, u.money)
      if (falta.length) {
        await responder(`> Para pasar a +${nivel + 1} te falta: ${falta.join(', ')}.`)
        return
      }

      const r = intentar(nivel, u.items.spada > 0)
      patchUserData(sender, {
        money: u.money - c.dinero,
        items: {
          sword:     u.items.sword - c.espadas,
          sp:        u.items.sp - c.sp,
          legendary: u.items.legendary - c.legendarios,
          spada:     u.items.spada - (r.usoProteccion ? 1 : 0),
        },
        arma: { nivel: r.nivel },
      })

      const texto = r.exito
        ? `🔨✨ *¡Éxito!* Tu arma ahora es *+${r.nivel}*  (daño en raid ×${bonoArma(r.nivel).toFixed(2)})`
        : r.usoProteccion
          ? `🔨💥 Falló… pero la 🛡️ piedra de protección se rompió en su lugar. Sigues en *+${r.nivel}*.`
          : r.nivel < nivel
            ? `🔨💥 *Falló* y el arma se dañó: bajó a *+${r.nivel}*.`
            : `🔨💥 *Falló.* Perdiste los materiales; sigues en *+${r.nivel}*.`
      await responder(texto)
      return
    }

    // ─── !forjar proteccion ────────────────────────────────────────────────
    if (['proteccion', 'protección', 'piedra', 'escudo'].includes(sub)) {
      const falta = faltante(COSTO_PROTECCION, u.items, u.money)
      if (falta.length) {
        await responder(`> Para una 🛡️ piedra de protección te falta: ${falta.join(', ')}.`)
        return
      }
      patchUserData(sender, {
        money: u.money - COSTO_PROTECCION.dinero,
        items: {
          sword:     u.items.sword - COSTO_PROTECCION.espadas,
          legendary: u.items.legendary - COSTO_PROTECCION.legendarios,
          spada:     u.items.spada + 1,
        },
      })
      await responder(`🛡️ Forjaste una piedra de protección. Tienes *${u.items.spada + 1}*.`)
      return
    }

    // ─── !forjar — el estado ───────────────────────────────────────────────
    const prox = nivel < MAX_NIVEL ? costo(nivel) : null
    await responder([
      `╭─「 🔨 FORJA 」`,
      `│`,
      `│ Tu arma: *+${nivel}*  · daño en raid ×${bonoArma(nivel).toFixed(2)}`,
      `│ Tienes: ${u.items.sword} ⚔️  ${u.items.sp} ✨  ${u.items.legendary} 🏆  ${u.items.spada} 🛡️`,
      `│`,
      ...(prox
        ? [
            `│ *+${nivel} → +${nivel + 1}*  ·  ${probabilidad(nivel)}% de éxito`,
            `│ Cuesta: ${linea(prox)}`,
            nivel >= NIVEL_RIESGO
              ? `│ ⚠️ Si falla, baja a +${nivel - 1} (salvo que tengas 🛡️)`
              : `│ Si falla, solo pierdes los materiales`,
          ]
        : [`│ Ya está al máximo.`]),
      `│`,
      `│ \`${prefix}forjar mejorar\` — intentar el +1`,
      `│ \`${prefix}forjar proteccion\` — 🛡️ (${linea(COSTO_PROTECCION)})`,
      `╰─ ⚔️ ✨ 🏆 salen de daily, weekly, monthly, mine y chest`,
    ].join('\n'))
  },
}

export default command
