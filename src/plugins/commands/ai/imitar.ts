import type { Command } from '../../../types/index.js'
import { safeSend }    from '@lib/media_sender.js'
import { hepein }      from '@lib/hepein.js'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalizeJid(raw: string): string {
  return raw.replace(/[^0-9]/g, '') + '@s.whatsapp.net'
}

function fmtProfile(p: NonNullable<Awaited<ReturnType<typeof hepein.getProfile>>>, prefix: string): string {
  if (p.msg_count < 15) {
    return `✗ Perfil incompleto — se necesitan al menos 15 mensajes (tiene ${p.msg_count})\n§ Escribe más en el grupo para generar tu perfil.`
  }

  const hours = p.active_hours.length
    ? p.active_hours.slice(0, 3).map(h => `${h}:00`).join(', ')
    : '—'

  const words = p.common_words.length
    ? p.common_words.slice(0, 10).join(', ')
    : '—'

  const sample = p.vocab_sample.length
    ? p.vocab_sample.slice(0, 3).map(s => `"${s}"`).join('\n  ')
    : '—'

  return [
    `◈ *Perfil de Estilo — Hepein*`,
    ``,
    `§ Mensajes analizados: *${p.msg_count}*`,
    `§ Longitud promedio:   *${p.avg_len.toFixed(0)} chars*`,
    `§ Frecuencia de emoji: *${(p.emoji_freq * 100).toFixed(0)}%*`,
    `§ Usa jerga:           *${p.uses_slang ? 'Sí' : 'No'}*`,
    `§ Horas activas:       *${hours}*`,
    `§ Palabras frecuentes: *${words}*`,
    ``,
    `§ Ejemplos de cómo escribes:`,
    `  ${sample}`,
    ``,
    `§ *${prefix}olvidar* — borrar tu perfil`,
  ].join('\n')
}

// ─── Comando principal: !imitar ───────────────────────────────────────────────

const imitar: Command = {
  name:        'imitar',
  aliases:     ['imitate', 'hablar', 'copy'],
  description: 'Hepein habla imitando el estilo de un usuario del grupo',
  category:    'ai',
  cooldown:    10,

  async execute({ sock, jid, msg, args, prefix, sender, isGroup }) {
    if (!isGroup) {
      await safeSend(() => sock.sendMessage(jid, {
        text: '✗ Este comando solo funciona en grupos.',
      }, { quoted: msg }))
      return
    }

    // Obtener el JID del objetivo
    const mentionedJids = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid ?? []
    const quotedParticipant = msg.message?.extendedTextMessage?.contextInfo?.participant

    let targetJid: string | undefined

    if (mentionedJids.length > 0) {
      targetJid = mentionedJids[0]
    } else if (quotedParticipant) {
      targetJid = quotedParticipant
    } else if (args[0] && /^\d{7,}/.test(args[0])) {
      targetJid = normalizeJid(args[0])
    }

    if (!targetJid) {
      await safeSend(() => sock.sendMessage(jid, {
        text: [
          `✗ Debes mencionar a alguien: *${prefix}imitar @usuario texto*`,
          ``,
          `§ Ejemplos:`,
          `  ${prefix}imitar @Juan ¿qué onda?`,
          `  ${prefix}imitar @Maria cuéntame algo`,
        ].join('\n'),
      }, { quoted: msg }))
      return
    }

    // Texto a imitar: todo después de la mención
    const prompt = args.filter(a => !a.startsWith('@') && !/^\d{10,}/.test(a)).join(' ').trim()
      || 'Hola qué hay de nuevo'

    const res = await hepein.imitate({
      prompt,
      targetJid,
      groupJid:   jid,
      senderJid:  sender,
    })

    if (!res.ok) {
      await safeSend(() => sock.sendMessage(jid, {
        text: `✗ No pude imitar — ${res.error ?? 'servicio no disponible'}`,
      }, { quoted: msg }))
      return
    }

    const targetNum = targetJid.split('@')[0]
    const profileNote = res.hasProfile
      ? `_(${res.msgCount} msgs analizados)_`
      : `_(perfil incompleto — respuesta genérica)_`

    await safeSend(() => sock.sendMessage(jid, {
      text:     `🎭 *@${targetNum}:* ${res.text}\n\n${profileNote}`,
      mentions: [targetJid!],
    }, { quoted: msg }))
  },
}

// ─── Comando: !miestilo ───────────────────────────────────────────────────────

const miestilo: Command = {
  name:        'miestilo',
  aliases:     ['mystyle', 'miperfilia', 'miperfil-ia'],
  description: 'Ver tu perfil de estilo aprendido por Hepein',
  category:    'ai',
  cooldown:    15,

  async execute({ sock, jid, msg, prefix, sender, isGroup }) {
    if (!isGroup) {
      await safeSend(() => sock.sendMessage(jid, {
        text: '✗ Este comando solo funciona en grupos (los mensajes se aprenden por grupo).',
      }, { quoted: msg }))
      return
    }

    await safeSend(() => sock.sendMessage(jid, {
      text: '⏳ Analizando tu perfil...',
    }, { quoted: msg }))

    const profile = await hepein.getProfile(sender)

    if (!profile) {
      await safeSend(() => sock.sendMessage(jid, {
        text: `✗ Servicio de IA no disponible ahora mismo.`,
      }, { quoted: msg }))
      return
    }

    await safeSend(() => sock.sendMessage(jid, {
      text: fmtProfile(profile, prefix),
    }, { quoted: msg }))
  },
}

// ─── Comando: !estilode @usuario ─────────────────────────────────────────────

const estilode: Command = {
  name:        'estilode',
  aliases:     ['styleof', 'perfiliade'],
  description: 'Ver el perfil de estilo de otro usuario',
  category:    'ai',
  cooldown:    15,

  async execute({ sock, jid, msg, prefix, isGroup, isAdmin, isOwner }) {
    if (!isGroup) {
      await safeSend(() => sock.sendMessage(jid, {
        text: '✗ Solo funciona en grupos.',
      }, { quoted: msg }))
      return
    }

    if (!isAdmin && !isOwner) {
      await safeSend(() => sock.sendMessage(jid, {
        text: '✗ Solo admins pueden ver el perfil de otros.',
      }, { quoted: msg }))
      return
    }

    const mentionedJids = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid ?? []
    const targetJid     = mentionedJids[0]

    if (!targetJid) {
      await safeSend(() => sock.sendMessage(jid, {
        text: `✗ Menciona a alguien: *${prefix}estilode @usuario*`,
      }, { quoted: msg }))
      return
    }

    await safeSend(() => sock.sendMessage(jid, {
      text: '⏳ Analizando perfil...',
    }, { quoted: msg }))

    const profile = await hepein.getProfile(targetJid)

    if (!profile) {
      await safeSend(() => sock.sendMessage(jid, {
        text: '✗ Servicio no disponible.',
      }, { quoted: msg }))
      return
    }

    const num = targetJid.split('@')[0]
    await safeSend(() => sock.sendMessage(jid, {
      text:     `@${num}\n\n` + fmtProfile(profile, prefix),
      mentions: [targetJid],
    }, { quoted: msg }))
  },
}

// ─── Comando: !olvidar ────────────────────────────────────────────────────────

const olvidar: Command = {
  name:        'olvidar',
  aliases:     ['forgetme', 'borrariadat', 'borrarianalizis'],
  description: 'Borrar tu perfil de Hepein (privacidad)',
  category:    'ai',
  cooldown:    30,

  async execute({ sock, jid, msg, sender }) {
    const result = await hepein.deleteProfile(sender)
    await safeSend(() => sock.sendMessage(jid, {
      text: result.deletedRows > 0
        ? `✔ Eliminados ${result.deletedRows} mensajes de tu perfil. Hepein ya no te recuerda.`
        : `§ No había datos guardados de ti o el servicio está offline.`,
    }, { quoted: msg }))
  },
}

// ─── Comando: !hepein-stats ───────────────────────────────────────────────────

const hepeinStats: Command = {
  name:        'hepeinstats',
  aliases:     ['iaestats', 'trainerinfo'],
  description: 'Estadísticas del pipeline de aprendizaje',
  category:    'ai',
  cooldown:    30,

  async execute({ sock, jid, msg, isOwner }) {
    if (!isOwner) {
      await safeSend(() => sock.sendMessage(jid, {
        text: '✗ Solo el owner puede ver las stats del trainer.',
      }, { quoted: msg }))
      return
    }

    const stats = await hepein.stats()

    if (!stats) {
      await safeSend(() => sock.sendMessage(jid, {
        text: '✗ Trainer offline.',
      }, { quoted: msg }))
      return
    }

    await safeSend(() => sock.sendMessage(jid, {
      text: [
        `◈ *Hepein Trainer — Stats*`,
        ``,
        `§ Archivos Parquet: *${stats.parquetFiles}*`,
        `§ Espacio en disco: *${stats.diskMb} MB*`,
        `§ Buffer pendiente: *${stats.bufferPending} msgs*`,
      ].join('\n'),
    }, { quoted: msg }))
  },
}

export default [imitar, miestilo, estilode, olvidar, hepeinStats]
