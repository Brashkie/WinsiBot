import type { Command } from '../../../types/index.js'
import { getUserData, getGroupConfig } from '@core/events.js'
import { safeSend } from '@lib/media_sender.js'
import { IDIOMAS, leerIdioma, idiomaDe, t, type Idioma } from '@lib/i18n.js'
import { numeroDe } from '@lib/members.js'

// #idioma: elegir en qué idioma te habla el bot, o volver al automático
// (por el país de tu número, ver i18n.ts). Los admins fijan el del grupo.

const command: Command = {
  name:        'idioma',
  aliases:     ['language', 'lang', 'lingua', 'langue'],
  description: 'Cambia el idioma en que te habla el bot (es, en, pt)  |  !idioma en  ·  !idioma auto  ·  !idioma grupo pt',
  category:    'general',
  cooldown:    3,

  async execute({ sock, jid, msg, args, sender, prefix, isGroup, isAdmin, isOwner, lang }) {
    const responder = (text: string) => safeSend(() => sock.sendMessage(jid, { text }, { quoted: msg }))
    const u = getUserData(sender)
    const sub = (args[0] ?? '').toLowerCase()
    const p = prefix

    // ─── !idioma grupo <es|en|pt|off> ──────────────────────────────────────
    if (['grupo', 'group', 'gc'].includes(sub)) {
      if (!isGroup) { await responder(t(lang, 'idioma.soloGrupo')); return }
      if (!isAdmin && !isOwner) { await responder(t(lang, 'idioma.noAdmin')); return }
      const g = getGroupConfig(jid)
      const valor = (args[1] ?? '').toLowerCase()
      if (['off', 'no', 'ninguno', 'none', 'nenhum'].includes(valor)) {
        delete g.idioma
        await responder(t(lang, 'idioma.grupoOff'))
        return
      }
      const nuevo = leerIdioma(valor)
      if (!nuevo) { await responder(t(lang, 'idioma.noEntiendo')); return }
      g.idioma = nuevo
      // Se contesta en el idioma nuevo del grupo: es el que el admin quiere ver.
      await responder(t(nuevo, 'idioma.grupoListo', IDIOMAS[nuevo]))
      return
    }

    // ─── !idioma auto ──────────────────────────────────────────────────────
    if (['auto', 'automatico', 'automático', 'automatic', 'reset'].includes(sub)) {
      delete u.idioma
      // Sin elección propia, el que toca ahora: el del país, o el del grupo.
      const ahora: Idioma = idiomaDe({ numero: numeroDe(sender, msg, isGroup), grupo: isGroup ? getGroupConfig(jid).idioma : undefined })
      await responder(t(ahora, 'idioma.autoListo', IDIOMAS[ahora]))
      return
    }

    // ─── !idioma <es|en|pt> ────────────────────────────────────────────────
    if (sub) {
      const nuevo = leerIdioma(sub)
      if (!nuevo) { await responder(t(lang, 'idioma.noEntiendo')); return }
      u.idioma = nuevo
      await responder(t(nuevo, 'idioma.listo', IDIOMAS[nuevo]))
      return
    }

    // ─── !idioma — el estado ───────────────────────────────────────────────
    const g = isGroup ? getGroupConfig(jid).idioma : undefined
    await responder([
      t(lang, 'idioma.actual', { ...IDIOMAS[lang], origen: t(lang, u.idioma ? 'idioma.elegido' : 'idioma.auto') }),
      isGroup ? t(lang, 'idioma.grupo', { grupo: g ? `${IDIOMAS[g].bandera} ${IDIOMAS[g].nombre}` : t(lang, 'idioma.ninguno') }) : '',
      t(lang, 'idioma.uso', { p }),
    ].filter(Boolean).join('\n'))
  },
}

export default command
