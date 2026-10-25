import type { Command } from '../../../types/index.js'
import { getUserData, fmtCooldown } from '@core/events.js'
import { safeSend, sendCritical } from '@lib/media_sender.js'
import { saludDe, curar, esperaHasta, costoHospital, MAX, MIN_PELEAR, POCION } from '@lib/health.js'
import { barra } from '@lib/raid.js'

// #salud, #curar y #hospital (ver health.ts). La salud baja con el
// contraataque del jefe del raid y se recupera sola; esto es para no esperar.

const CURAR    = new Set(['curar', 'pocion', 'poción', 'heal'])
const HOSPITAL = new Set(['hospital', 'clinica', 'clínica'])

const command: Command = {
  name:        'salud',
  aliases:     ['vida', 'health', 'hp', 'curar', 'pocion', 'poción', 'heal', 'hospital', 'clinica', 'clínica'],
  description: 'Tu salud, y curarte  |  !salud  ·  !curar (una poción)  ·  !hospital (pagando)',
  category:    'rpg',
  cooldown:    3,

  async execute({ sock, jid, msg, sender, pushName, prefix, command: usado, args }) {
    const u = getUserData(sender, pushName)
    const sub = (args[0] ?? '').toLowerCase()
    const modo = CURAR.has(usado) || CURAR.has(sub) ? 'curar' : HOSPITAL.has(usado) || HOSPITAL.has(sub) ? 'hospital' : 'ver'
    const responder = (text: string) => safeSend(() => sock.sendMessage(jid, { text }, { quoted: msg }))
    const antes = saludDe(u)

    if (modo !== 'ver' && antes >= MAX) {
      await responder(`> ❤ Ya estás con la salud llena (${MAX}/${MAX}).`)
      return
    }

    // ─── !curar: una poción ────────────────────────────────────────────────
    if (modo === 'curar') {
      if (u.items.pc <= 0) {
        await responder(`> 🧪 No tenés pociones. Salen en el \`${prefix}daily\`, o pagá el \`${prefix}hospital\` (¥${costoHospital(u).toLocaleString()}).`)
        return
      }
      u.items.pc--
      const ahora = curar(u, POCION)
      await sendCritical(sock, jid, {
        text: `🧪 Te tomaste una poción: ❤ ${antes} → *${ahora}*/${MAX}.\n> Te quedan ${u.items.pc} poción(es).`,
      }, { quoted: msg })
      return
    }

    // ─── !hospital: llenarla pagando ───────────────────────────────────────
    if (modo === 'hospital') {
      const costo = costoHospital(u)
      if (u.money < costo) {
        await responder([
          `> 🏥 Curarte entero cuesta *¥${costo.toLocaleString()}* y tenés ¥${u.money.toLocaleString()}.`,
          `> Gratis: esperar *${fmtCooldown(esperaHasta(u, MAX))}*${u.items.pc > 0 ? `, o \`${prefix}curar\` (tenés ${u.items.pc} poción(es))` : ''}.`,
        ].join('\n'))
        return
      }
      u.money -= costo
      curar(u, MAX)
      await sendCritical(sock, jid, {
        text: `🏥 Te atendieron en el hospital: ❤ ${antes} → *${MAX}*/${MAX}.\n> -¥${costo.toLocaleString()} · te quedan ¥${u.money.toLocaleString()}`,
      }, { quoted: msg })
      return
    }

    // ─── !salud: el estado ─────────────────────────────────────────────────
    await responder([
      `╭─「 ❤ SALUD 」`,
      `│`,
      `│ ${barra(antes, MAX)} *${antes}*/${MAX}`,
      antes < MIN_PELEAR ? `│ 🤕 Muy herido para el raid (mínimo ${MIN_PELEAR})` : '',
      antes < MAX ? `│ Llena en ${fmtCooldown(esperaHasta(u, MAX))}, sola` : `│ Llena`,
      `│`,
      `│ 🧪 Pociones: ${u.items.pc} (+${POCION} cada una)`,
      antes < MAX ? `│ 🏥 Hospital: ¥${costoHospital(u).toLocaleString()}` : '',
      `╰─ \`${prefix}curar\` · \`${prefix}hospital\``,
    ].filter(Boolean).join('\n'))
  },
}

export default command
