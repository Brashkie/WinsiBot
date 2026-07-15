import type { Command } from '../../../types/index.js'
import { getUserData, getUserClan, expForLevel, userData } from '@core/events.js'
import { getUserInventory } from './rollwaifu.js'
import { safeSend } from '@lib/media_sender.js'

const bar = (cur: number, max: number, len = 10) => {
  const filled = Math.min(len, Math.floor((cur / max) * len))
  return `${'▰'.repeat(filled)}${'▱'.repeat(len - filled)}`
}

const DAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
const MONTHS = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]

// "DD/MM" guardado por !birthday → "sábado, 10 de enero" (próxima ocurrencia)
function formatBirthday(birth: string): string | null {
  const m = birth.match(/^(\d{2})\/(\d{2})$/)
  if (!m) return null
  const day   = parseInt(m[1]!, 10)
  const month = parseInt(m[2]!, 10) - 1
  if (day < 1 || day > 31 || month < 0 || month > 11) return null

  const now   = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  let date    = new Date(now.getFullYear(), month, day)
  if (date < today) date = new Date(now.getFullYear() + 1, month, day)

  return `${DAYS[date.getDay()]}, ${day} de ${MONTHS[month]}`
}

// Puesto en el ranking global — mismo criterio que !leveltop (nivel, luego exp)
function getRankPosition(jid: string): number {
  const sorted = [...userData.entries()]
    .filter(([, u]) => u.level > 0 || u.exp > 0)
    .sort((a, b) => b[1].level - a[1].level || b[1].exp - a[1].exp)
  const idx = sorted.findIndex(([j]) => j === jid)
  return idx === -1 ? sorted.length + 1 : idx + 1
}

const command: Command = {
  name:        'perfil',
  aliases:     ['profile', 'miperfil', 'yo'],
  description: 'Ver perfil propio o de otro (@mencionar o respondiendo su mensaje)',
  category:    'rpg',
  cooldown:    5,

  async execute({ sock, jid, msg, sender, pushName }) {
    // Objetivo: @mención tiene prioridad, si no hay se usa a quién se le
    // respondió (contextInfo.participant = remitente del mensaje citado),
    // si no hay ninguno de los dos es el propio remitente.
    const ctxInfo  = msg.message?.extendedTextMessage?.contextInfo
    const mentioned = ctxInfo?.mentionedJid?.[0]
    const repliedTo = ctxInfo?.participant
    const target    = mentioned ?? repliedTo ?? sender
    const isSelf    = target === sender

    // pushName es el nombre de WhatsApp de quien ESCRIBIÓ el comando — nunca
    // debe usarse como fallback del nombre de OTRO usuario (antes, ver perfil
    // de alguien sin `name` guardado mostraba el nombre de quien preguntaba).
    const user   = getUserData(target, isSelf ? pushName : '')
    const clan   = getUserClan(target)
    const need   = expForLevel(user.level)
    const num    = target.split('@')[0]
    const name   = user.name || (isSelf ? pushName : '') || num

    const harem      = getUserInventory(target)
    const haremValue = harem.reduce((sum, c) => sum + (Number(c.value) || 0), 0)
    const rankPos    = getRankPosition(target)
    const pct        = need > 0 ? Math.min(100, Math.floor((user.exp / need) * 100)) : 100

    const lines: string[] = [`「✦」*Perfil* ↗ *${name}* ↙`, '']

    const bday       = formatBirthday(user.profile.birth)
    const genreLabel = user.profile.genre === 'm' ? 'Hombre'
                      : user.profile.genre === 'f' ? 'Mujer'
                      : user.profile.genre

    if (bday)              lines.push(`🎂 Cumpleaños » *${bday}*`)
    if (genreLabel)        lines.push(`⚧ Género » *${genreLabel}*`)
    if (user.profile.marry) lines.push(`♡ Casado con » @${user.profile.marry.split('@')[0]}`)
    if (bday || genreLabel || user.profile.marry) lines.push('')

    lines.push(
      `☆ Experiencia » *${user.exp.toLocaleString()}*`,
      `◈ Nivel » *${user.level}*  (${user.profile.role})`,
      `➔ Progreso » ${user.exp.toLocaleString()} ⇒ ${need.toLocaleString()}  (${pct}%)`,
      `   ${bar(user.exp, need)}`,
      `# Puesto » *#${rankPos}*`,
      '',
      `🎀 Harem » *${harem.length.toLocaleString()}*`,
      `◈ Valor total » *${haremValue.toLocaleString()}*`,
      `¥ Coins totales » *¥${(user.money + user.bank).toLocaleString()}*`,
      `□ Comandos usados » *${user.commandsUsed.toLocaleString()}*`,
      '',
      `❤ Salud » ${user.health}/100`,
      `🔥 Crimen » ${user.crime}`,
    )

    if (user.profile.description) lines.push(`_"${user.profile.description}"_`)
    if (clan) lines.push(`[${clan.tag}] ${clan.name}  Nv.${clan.level}`)
    if (user.profile.afk > 0) lines.push(`💤 AFK${user.profile.afkReason ? ` — ${user.profile.afkReason}` : ''}`)
    if (user.premium) lines.push('★ _Premium_')

    const mentions = [target]
    if (user.profile.marry) mentions.push(user.profile.marry)

    const caption = lines.join('\n')

    let pfpUrl: string | undefined
    try {
      pfpUrl = await sock.profilePictureUrl(target, 'image')
    } catch {
      pfpUrl = undefined
    }

    if (pfpUrl) {
      await safeSend(() => sock.sendMessage(jid, {
        image:   { url: pfpUrl! },
        caption,
        mentions,
      }, { quoted: msg }))
    } else {
      await safeSend(() => sock.sendMessage(jid, { text: caption, mentions }, { quoted: msg }))
    }
  },
}

export default command
