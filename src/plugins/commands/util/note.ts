import type { Command } from '../../../types/index.js'
import { safeSend } from '@lib/media_sender.js'
import { fechaHoraLocal } from '@lib/utils.js'
import { winsiStore } from '@core/store.js'
import {
  MAX_NOTAS, MAX_TEXTO, nombreDeNota, notasDe, leerNota, guardarNota, borrarNota,
} from '@lib/groupNotes.js'

// Ver groupNotes.ts. `#reglas` es un atajo de `#nota reglas`.

const GUARDAR = new Set(['set', 'guardar', 'nueva', 'crear', 'save'])
const BORRAR = new Set(['borrar', 'del', 'eliminar', 'quitar', 'delete'])

const command: Command = {
  name:        'nota',
  aliases:     ['notas', 'note', 'notes', 'reglas', 'rules'],
  description: 'Notas del grupo (reglas, pagos, horarios…)  |  !nota <nombre>  ·  !nota set <nombre> <texto>  ·  !reglas',
  category:    'util',
  cooldown:    3,
  groupOnly:   true,

  async execute({ sock, jid, msg, sender, args, prefix, isAdmin, isOwner, command: usado }) {
    const responder = (text: string) => safeSend(() => sock.sendMessage(jid, { text }, { quoted: msg }))
    // `#reglas` = `#nota reglas`, y `#reglas set <texto>` = `#nota set reglas <texto>`.
    const atajo = usado === 'reglas' || usado === 'rules'
    const partes = atajo
      ? (GUARDAR.has((args[0] ?? '').toLowerCase()) || BORRAR.has((args[0] ?? '').toLowerCase())
        ? [args[0]!, 'reglas', ...args.slice(1)]
        : ['reglas'])
      : args
    const sub = (partes[0] ?? '').toLowerCase()

    // ─── guardar ───────────────────────────────────────────────────────────
    if (GUARDAR.has(sub)) {
      if (!isAdmin && !isOwner) { await responder(`> Las notas las guardan los admins.`); return }
      const nombre = nombreDeNota(partes[1] ?? '')
      // Sin texto, el del mensaje al que se responde.
      const citado = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage as any
      const texto = (partes.slice(2).join(' ').trim()
        || citado?.conversation || citado?.extendedTextMessage?.text || citado?.imageMessage?.caption || '').trim()
      if (!nombre || !texto) {
        await responder(`> \`${prefix}nota set <nombre> <texto>\` — o responde a un mensaje con \`${prefix}nota set <nombre>\``)
        return
      }
      const r = guardarNota(jid, nombre, texto, sender)
      await responder({
        ok:     `📝 Nota *${nombre}* guardada. Se ve con \`${prefix}nota ${nombre}\`${nombre === 'reglas' ? ` o \`${prefix}reglas\`` : ''}.`,
        llenas: `> Este grupo ya tiene ${MAX_NOTAS} notas. Borra alguna con \`${prefix}nota borrar <nombre>\`.`,
        larga:  `> La nota puede tener hasta ${MAX_TEXTO} caracteres (esta tiene ${texto.length}).`,
      }[r])
      return
    }

    // ─── borrar ────────────────────────────────────────────────────────────
    if (BORRAR.has(sub)) {
      if (!isAdmin && !isOwner) { await responder(`> Las notas las borran los admins.`); return }
      const nombre = nombreDeNota(partes[1] ?? '')
      await responder(nombre && borrarNota(jid, nombre) ? `🗑️ Nota *${nombre}* borrada.` : `> No hay ninguna nota con ese nombre.`)
      return
    }

    // ─── leer una ──────────────────────────────────────────────────────────
    if (sub) {
      const nombre = nombreDeNota(sub)
      const n = nombre ? leerNota(jid, nombre) : null
      if (!n) {
        await responder(atajo
          ? `> Este grupo no tiene reglas guardadas. Un admin las guarda con \`${prefix}reglas set <texto>\`.`
          : `> No hay ninguna nota *${nombre ?? sub}*. Mira \`${prefix}notas\`.`)
        return
      }
      await responder(`📝 *${nombre}*\n\n${n.texto}\n\n> ${winsiStore.getName(n.por)}, ${fechaHoraLocal(n.en)}`)
      return
    }

    // ─── la lista ──────────────────────────────────────────────────────────
    const todas = Object.keys(notasDe(jid)).sort()
    await responder(todas.length
      ? `📝 *Notas del grupo* (${todas.length})\n\n${todas.map(n => `  • ${n}`).join('\n')}\n\n> \`${prefix}nota <nombre>\` para leer una`
      : `> Este grupo no tiene notas. Un admin guarda una con \`${prefix}nota set <nombre> <texto>\`.`)
  },
}

export default command
