import type { Command } from '../../../types/index.js'
import { safeSend } from '@lib/media_sender.js'
import { parsearCuando, falta } from '@lib/when.js'
import {
  agregarRecordatorio, recordatoriosDe, borrarRecordatorio, MAX_POR_USUARIO,
} from '@lib/reminders.js'
import { fechaHoraLocal } from '@lib/utils.js'

const MIN_ESPERA = 60_000              // 1 minuto
const MAX_ESPERA = 365 * 86_400_000    // 1 año

const command: Command = {
  name:        'recordar',
  aliases:     ['recordatorio', 'remind', 'reminder', 'rec'],
  description: 'Te recuerda algo  |  !recordar 10m sacar la ropa  |  !recordar lista  |  !recordar borrar <n>',
  category:    'util',
  cooldown:    3,

  async execute({ sock, jid, msg, sender, args, prefix }) {
    const sub = (args[0] ?? '').toLowerCase()
    const responder = (text: string) =>
      safeSend(() => sock.sendMessage(jid, { text }, { quoted: msg }))

    // ─── !recordar lista ───────────────────────────────────────────────────
    if (sub === 'lista' || sub === 'list' || sub === 'ver') {
      const mios = recordatoriosDe(sender)
      if (!mios.length) {
        await responder(`> No tienes recordatorios pendientes.`)
        return
      }
      const ahora = Date.now()
      await responder([
        `⏰ *Tus recordatorios*`,
        ``,
        ...mios.map((r, i) =>
          `  ${i + 1}. *${r.text}*\n     ${fechaHoraLocal(r.at)} (en ${falta(r.at - ahora)})`),
        ``,
        `> \`${prefix}recordar borrar <n>\` para quitar uno.`,
      ].join('\n'))
      return
    }

    // ─── !recordar borrar <n> ──────────────────────────────────────────────
    if (sub === 'borrar' || sub === 'quitar' || sub === 'del') {
      const n = parseInt(args[1] ?? '')
      const r = Number.isFinite(n) ? borrarRecordatorio(sender, n) : null
      await responder(r
        ? `🗑️ Borrado: *${r.text}*`
        : `> No existe ese número. Mira \`${prefix}recordar lista\`.`)
      return
    }

    // ─── !recordar <cuándo> <qué> ──────────────────────────────────────────
    const c = parsearCuando(args.join(' '))
    if (!c) {
      await responder([
        `⏰ *Recordatorios*`,
        ``,
        `\`${prefix}recordar 10m sacar la ropa\``,
        `\`${prefix}recordar 2h30m llamar a mamá\``,
        `\`${prefix}recordar en 3 días pagar la luz\``,
        `\`${prefix}recordar a las 18:30 partido\``,
        `\`${prefix}recordar mañana 9:00 reunión\``,
        ``,
        `\`${prefix}recordar lista\` · \`${prefix}recordar borrar <n>\``,
      ].join('\n'))
      return
    }

    const espera = c.at - Date.now()
    if (espera < MIN_ESPERA || espera > MAX_ESPERA) {
      await responder(`> Tiene que ser entre 1 minuto y 1 año desde ahora.`)
      return
    }
    if (recordatoriosDe(sender).length >= MAX_POR_USUARIO) {
      await responder(`> Ya tienes ${MAX_POR_USUARIO} recordatorios. Borra alguno con \`${prefix}recordar borrar <n>\`.`)
      return
    }

    const r = agregarRecordatorio({ jid, sender, text: c.resto.slice(0, 500), at: c.at })
    await responder(`✅ Te lo recuerdo el *${fechaHoraLocal(r.at)}* (en ${falta(espera)}):\n> ${r.text}`)
  },
}

export default command
