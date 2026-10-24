import type { Command } from '../../../types/index.js'
import { getUserData, patchUserData } from '@core/events.js'
import { safeSend } from '@lib/media_sender.js'
import { winsiStore } from '@core/store.js'
import { ITEMS, MIN_MINUTOS, MAX_MINUTOS, pujaMinima } from '@lib/subastaReglas.js'
import {
  subastaDe, deVendedor, publicar, pujar, cancelar, describir, type Objeto,
} from '@lib/subastas.js'

// Ver subastas.ts: una por grupo, y todo lo que está en juego queda retenido.

const MIN_BASE = 100
const MAX_BASE = 10_000_000

function quedan(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  return s >= 60 ? `${Math.floor(s / 60)} min ${s % 60}s` : `${s}s`
}

const command: Command = {
  name:        'subasta',
  aliases:     ['subastas', 'auction', 'pujar', 'puja', 'bid'],
  description: 'Subasta dragones e ítems en el grupo  |  !subasta  ·  !subasta vender …  ·  !pujar <monto>',
  category:    'rpg',
  cooldown:    2,
  groupOnly:   true,

  async execute({ sock, jid, msg, sender, pushName, args, prefix, command: usado }) {
    const responder = (text: string, mentions: string[] = []) =>
      safeSend(() => sock.sendMessage(jid, { text, mentions }, { quoted: msg }))
    const esPuja = ['pujar', 'puja', 'bid'].includes(usado)
    const sub = esPuja ? 'pujar' : (args[0] ?? '').toLowerCase()
    const resto = esPuja ? args : args.slice(1)

    // ─── !pujar <monto> ────────────────────────────────────────────────────
    if (sub === 'pujar' || sub === 'puja' || sub === 'bid') {
      const actual = subastaDe(jid)
      const crudo = (resto[0] ?? '').toLowerCase()
      const monto = crudo === 'min' || crudo === 'minima' || crudo === 'mínima'
        ? (actual ? pujaMinima(actual.base, actual.puja?.monto ?? null) : NaN)
        : parseInt(crudo.replace(/[.,_]/g, ''))
      const r = pujar(jid, sender, monto)
      if (!r.ok) {
        const t = {
          'sin-subasta': `> No hay ninguna subasta abierta en este grupo.`,
          'es-vendedor': `> No puedes pujar en tu propia subasta.`,
          'ya-gana':     `> Ya vas ganando. Espera a que alguien te supere.`,
          'baja':        `> La puja mínima es *¥${r.minima?.toLocaleString()}*  (\`${prefix}pujar ${r.minima}\` o \`${prefix}pujar min\`).`,
          'sin-saldo':   `> No tienes ¥${Number.isFinite(monto) ? monto.toLocaleString() : '?'} (tienes ¥${getUserData(sender).money.toLocaleString()}).`,
        }[r.motivo]
        await responder(t)
        return
      }
      const s = r.subasta
      await responder([
        `🔨 @${sender.split('@')[0]} puja *¥${s.puja!.monto.toLocaleString()}* por ${describir(s.objeto)}`,
        r.superado ? `> @${r.superado.split('@')[0]}, te superaron: te devolví tu puja.` : '',
        r.alargo ? `> ⏱️ Puja en el último minuto: se alarga hasta ${quedan(s.termina - Date.now())}.` : `> Quedan ${quedan(s.termina - Date.now())}.`,
      ].filter(Boolean).join('\n'), [sender, ...(r.superado ? [r.superado] : [])])
      return
    }

    // ─── !subasta vender … ─────────────────────────────────────────────────
    if (sub === 'vender' || sub === 'sell' || sub === 'publicar') {
      if (subastaDe(jid)) {
        await responder(`> Ya hay una subasta abierta en este grupo. Espera a que termine.`)
        return
      }
      if (deVendedor(sender)) {
        await responder(`> Ya tienes una subasta abierta en otro grupo. Una a la vez.`)
        return
      }

      const u = getUserData(sender, pushName)
      const tipo = (resto[0] ?? '').toLowerCase()
      let objeto: Objeto | null = null
      let i = 0

      if (tipo === 'dragon' || tipo === 'dragón') {
        const n = parseInt(resto[1] ?? '')
        const d = Number.isInteger(n) ? u.dragons[n - 1] : undefined
        if (!d) {
          await responder(`> No tienes un dragón con ese número. Mira \`${prefix}pet\`.`)
          return
        }
        objeto = { tipo: 'dragon', dragon: d }
        i = 2
      } else if (ITEMS[tipo]) {
        const it = ITEMS[tipo]!
        const cant = parseInt(resto[1] ?? '')
        if (!Number.isInteger(cant) || cant < 1) {
          await responder(`> Indica la cantidad: \`${prefix}subasta vender ${tipo} <cantidad> <precio base>\``)
          return
        }
        if ((u.items[it.clave] ?? 0) < cant) {
          await responder(`> Solo tienes ${u.items[it.clave] ?? 0} ${it.nombre}.`)
          return
        }
        objeto = { tipo: 'item', clave: it.clave, cantidad: cant, nombre: it.nombre }
        i = 2
      }

      const base = parseInt((resto[i] ?? '').replace(/[.,_]/g, ''))
      const minutos = Math.min(Math.max(parseInt(resto[i + 1] ?? '') || 30, MIN_MINUTOS), MAX_MINUTOS)
      if (!objeto || !Number.isFinite(base)) {
        await responder([
          `╭─「 🔨 SUBASTAS 」`,
          `│`,
          `│ \`${prefix}subasta vender dragon <#> <base> [min]\``,
          `│ \`${prefix}subasta vender <ítem> <cantidad> <base> [min]\``,
          `│   ítems: espada, proteccion, pocion, sp, legendario`,
          `│`,
          `│ \`${prefix}pujar <monto>\` · \`${prefix}pujar min\``,
          `│ \`${prefix}subasta cancelar\` — si nadie pujó`,
          `│`,
          `│ Duración ${MIN_MINUTOS}–${MAX_MINUTOS} min (30 por defecto).`,
          `│ Pujar en el último minuto la alarga un minuto.`,
          `╰─ La casa se queda el 5% de la venta.`,
        ].join('\n'))
        return
      }
      if (base < MIN_BASE || base > MAX_BASE) {
        await responder(`> El precio base va de ¥${MIN_BASE} a ¥${MAX_BASE.toLocaleString()}.`)
        return
      }

      // Retener el objeto ANTES de publicar.
      if (objeto.tipo === 'dragon') {
        const d = objeto.dragon
        patchUserData(sender, { dragons: u.dragons.filter(x => x !== d) })
      } else {
        patchUserData(sender, { items: { [objeto.clave]: u.items[objeto.clave] - objeto.cantidad } })
      }
      const s = publicar(jid, sender, objeto, base, minutos)
      await responder([
        `╭─「 🔨 SUBASTA 」`,
        `│`,
        `│ @${sender.split('@')[0]} subasta ${describir(s.objeto)}`,
        `│ Base: *¥${base.toLocaleString()}* · ${minutos} min`,
        `│`,
        `╰─ \`${prefix}pujar ${base}\` para empezar`,
      ].join('\n'), [sender])
      return
    }

    // ─── !subasta cancelar ─────────────────────────────────────────────────
    if (sub === 'cancelar' || sub === 'retirar' || sub === 'cancel') {
      const s = cancelar(jid, sender)
      await responder(s
        ? `↩️ Retiraste la subasta: ${describir(s.objeto)} vuelve a tu inventario.`
        : `> Solo el vendedor puede retirarla, y solo si nadie pujó todavía.`)
      return
    }

    // ─── !subasta — el estado ──────────────────────────────────────────────
    const s = subastaDe(jid)
    if (!s) {
      await responder(`> No hay ninguna subasta abierta. Publica una con \`${prefix}subasta vender\`.`)
      return
    }
    await responder([
      `╭─「 🔨 SUBASTA 」`,
      `│`,
      `│ ${describir(s.objeto)}`,
      `│ Vende: ${winsiStore.getName(s.vendedor)}`,
      `│ ${s.puja
        ? `Va ganando: ${winsiStore.getName(s.puja.jid)} con *¥${s.puja.monto.toLocaleString()}*`
        : `Base: *¥${s.base.toLocaleString()}* · sin pujas`}`,
      `│ Quedan ${quedan(s.termina - Date.now())}`,
      `│`,
      `╰─ \`${prefix}pujar ${pujaMinima(s.base, s.puja?.monto ?? null)}\` o \`${prefix}pujar min\``,
    ].join('\n'))
  },
}

export default command
