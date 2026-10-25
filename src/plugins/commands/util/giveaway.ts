import type { Command } from '../../../types/index.js'
import { safeSend } from '@lib/media_sender.js'
import { parsearCuando, falta } from '@lib/when.js'
import { cuantosGanadores, elegirGanadores } from '@lib/raffle.js'
import { miembros, esElBot } from '@lib/members.js'
import { sorteoDe, crear, anotar, cancelar, cerrar } from '@lib/giveaways.js'
import { fechaHoraLocal } from '@lib/utils.js'

// #sorteo: con inscripción y hora de cierre (giveaways.ts), o al instante
// entre los miembros del grupo (`#sorteo rapido`).

const MIN = 60_000
const MAX = 7 * 86_400_000

const command: Command = {
  name:        'sorteo',
  aliases:     ['giveaway', 'rifa', 'sortear'],
  description: 'Sorteos en el grupo  |  !sorteo crear 30m <premio> [x2]  ·  !sorteo unirme  ·  !sorteo rapido <premio>',
  category:    'util',
  cooldown:    3,
  groupOnly:   true,

  async execute({ sock, jid, msg, sender, args, prefix, isAdmin, isOwner }) {
    const sub = (args[0] ?? '').toLowerCase()
    const responder = (text: string, mentions: string[] = []) =>
      safeSend(() => sock.sendMessage(jid, { text, mentions }, { quoted: msg }))
    const esAdmin = isAdmin || isOwner
    const s = sorteoDe(jid)

    // ─── unirse ────────────────────────────────────────────────────────────
    if (['unirme', 'unir', 'entrar', 'join', 'participar'].includes(sub)) {
      const r = anotar(jid, sender)
      await responder({
        ok:           `🎟️ Anotado. Van *${s?.anotados.length ?? 0}*.`,
        ya:           `> Ya estás anotado.`,
        'sin-sorteo': `> No hay ningún sorteo abierto en este grupo.`,
      }[r])
      return
    }

    // ─── crear ─────────────────────────────────────────────────────────────
    if (['crear', 'nuevo', 'new', 'iniciar'].includes(sub)) {
      if (!esAdmin) { await responder(`> Los sorteos los crean los admins.`); return }
      if (s) { await responder(`> Ya hay un sorteo abierto: \`${prefix}sorteo\``); return }
      const c = parsearCuando(args.slice(1).join(' '))
      if (!c) {
        await responder(`> \`${prefix}sorteo crear 30m Nitro\` · \`${prefix}sorteo crear a las 20:00 Una pizza x2\``)
        return
      }
      const espera = c.at - Date.now()
      if (espera < MIN || espera > MAX) { await responder(`> Tiene que cerrar entre 1 minuto y 7 días desde ahora.`); return }
      const { cuantos, premio } = cuantosGanadores(c.resto)
      if (!premio) { await responder(`> ¿Qué se sortea? \`${prefix}sorteo crear 30m <premio>\``); return }
      crear({ gjid: jid, premio, por: sender, ganadores: cuantos, termina: c.at })
      await responder([
        `🎁 *¡SORTEO!*`,
        ``,
        `*Premio:* ${premio}${cuantos > 1 ? `  ·  ${cuantos} ganadores` : ''}`,
        `*Cierra:* ${fechaHoraLocal(c.at)} (en ${falta(espera)})`,
        ``,
        `> \`${prefix}sorteo unirme\` para participar`,
      ].join('\n'))
      return
    }

    // ─── cerrar ya / cancelar ──────────────────────────────────────────────
    if (['ya', 'cerrar', 'terminar', 'end'].includes(sub)) {
      if (!esAdmin) { await responder(`> Lo cierra un admin.`); return }
      if (!s) { await responder(`> No hay ningún sorteo abierto.`); return }
      await cerrar(jid)
      return
    }
    if (['cancelar', 'cancel', 'anular'].includes(sub)) {
      if (!esAdmin) { await responder(`> Lo cancela un admin.`); return }
      await responder(cancelar(jid) ? `🛑 Sorteo cancelado, sin ganadores.` : `> No hay ningún sorteo abierto.`)
      return
    }

    // ─── rápido: entre los miembros, ya ────────────────────────────────────
    if (['rapido', 'rápido', 'ahora', 'quick'].includes(sub)) {
      if (!esAdmin) { await responder(`> El sorteo rápido lo hace un admin.`); return }
      const { cuantos, premio } = cuantosGanadores(args.slice(1).join(' '))
      const ms = (await miembros(sock, jid).catch(() => [])).filter(m => !esElBot(sock, m))
      const ganan = elegirGanadores(ms.map(m => m.id), cuantos)
      if (!ganan.length) { await responder(`> No pude leer los miembros del grupo.`); return }
      await responder([
        `🎉 *SORTEO RÁPIDO*${premio ? ` — ${premio}` : ''}`,
        ``,
        `👑 ${ganan.map(j => `@${j.split('@')[0]}`).join(', ')}`,
        `> Entre los ${ms.length} miembros del grupo.`,
      ].join('\n'), ganan)
      return
    }

    // ─── el estado ─────────────────────────────────────────────────────────
    if (!s) {
      await responder([
        `🎁 *Sorteos*`,
        ``,
        `\`${prefix}sorteo crear 30m <premio>\` — con inscripción (admins)`,
        `\`${prefix}sorteo crear a las 20:00 <premio> x3\` — 3 ganadores`,
        `\`${prefix}sorteo unirme\` — participar`,
        `\`${prefix}sorteo ya\` · \`${prefix}sorteo cancelar\` — cerrar antes o anular`,
        `\`${prefix}sorteo rapido <premio>\` — al instante, entre todos los miembros`,
      ].join('\n'))
      return
    }
    await responder([
      `🎁 *Sorteo:* ${s.premio}${s.ganadores > 1 ? `  ·  ${s.ganadores} ganadores` : ''}`,
      `Cierra ${fechaHoraLocal(s.termina)} (en ${falta(s.termina - Date.now())}) · ${s.anotados.length} anotado${s.anotados.length === 1 ? '' : 's'}`,
      `> \`${prefix}sorteo unirme\``,
    ].join('\n'))
  },
}

export default command
