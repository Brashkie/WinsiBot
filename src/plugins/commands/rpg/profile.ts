import type { Command } from '../../../types/index.js'
import { saludDe } from '@lib/health.js'
import { getUserData, getUserClan, expForLevel, userData } from '@core/events.js'
import { getUserInventory } from './rollwaifu.js'
import { safeSend } from '@lib/media_sender.js'
import { tx, type Idioma } from '@lib/i18n.js'

const bar = (cur: number, max: number, len = 10) => {
  const filled = Math.min(len, Math.floor((cur / max) * len))
  return `${'▰'.repeat(filled)}${'▱'.repeat(len - filled)}`
}

const LOCALE: Record<Idioma, string> = { es: 'es-PE', en: 'en-US', pt: 'pt-BR' }

const T = {
  titulo:   { es: '「✦」*Perfil* ↗ *{n}* ↙', en: '「✦」*Profile* ↗ *{n}* ↙', pt: '「✦」*Perfil* ↗ *{n}* ↙' },
  cumple:   { es: '🎂 Cumpleaños » *{v}*', en: '🎂 Birthday » *{v}*', pt: '🎂 Aniversário » *{v}*' },
  genero:   { es: '⚧ Género » *{v}*', en: '⚧ Gender » *{v}*', pt: '⚧ Gênero » *{v}*' },
  hombre:   { es: 'Hombre', en: 'Man', pt: 'Homem' },
  mujer:    { es: 'Mujer', en: 'Woman', pt: 'Mulher' },
  otro:     { es: 'Otro', en: 'Other', pt: 'Outro' },
  casado:   { es: '♡ Casado con » @{v}', en: '♡ Married to » @{v}', pt: '♡ Casado com » @{v}' },
  exp:      { es: '☆ Experiencia » *{v}*', en: '☆ Experience » *{v}*', pt: '☆ Experiência » *{v}*' },
  nivel:    { es: '◈ Nivel » *{v}*  ({rol})', en: '◈ Level » *{v}*  ({rol})', pt: '◈ Nível » *{v}*  ({rol})' },
  progreso: { es: '➔ Progreso » {a} ⇒ {b}  ({pct}%)', en: '➔ Progress » {a} ⇒ {b}  ({pct}%)', pt: '➔ Progresso » {a} ⇒ {b}  ({pct}%)' },
  puesto:   { es: '# Puesto » *#{v}*', en: '# Rank » *#{v}*', pt: '# Posição » *#{v}*' },
  valor:    { es: '◈ Valor total » *{v}*', en: '◈ Total value » *{v}*', pt: '◈ Valor total » *{v}*' },
  coins:    { es: '¥ Coins totales » *¥{v}*', en: '¥ Total coins » *¥{v}*', pt: '¥ Moedas no total » *¥{v}*' },
  oro:      { es: '◇ Oro » *{v}*', en: '◇ Gold » *{v}*', pt: '◇ Ouro » *{v}*' },
  dragones: { es: '🐉 Dragones » *{v}*', en: '🐉 Dragons » *{v}*', pt: '🐉 Dragões » *{v}*' },
  comandos: { es: '□ Comandos usados » *{v}*', en: '□ Commands used » *{v}*', pt: '□ Comandos usados » *{v}*' },
  salud:    { es: '❤ Salud » {v}/100', en: '❤ Health » {v}/100', pt: '❤ Saúde » {v}/100' },
  crimen:   { es: '🔥 Crimen » {v}', en: '🔥 Crime » {v}', pt: '🔥 Crime » {v}' },
}

// "DD/MM" guardado por !birthday → "sábado, 10 de enero" / "Saturday, January 10"
// (la próxima vez que cae). Intl ya trae los nombres de días y meses.
function formatBirthday(birth: string, lang: Idioma): string | null {
  const m = birth.match(/^(\d{2})\/(\d{2})$/)
  if (!m) return null
  const day   = parseInt(m[1]!, 10)
  const month = parseInt(m[2]!, 10) - 1
  if (day < 1 || day > 31 || month < 0 || month > 11) return null

  const now   = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  let date    = new Date(now.getFullYear(), month, day)
  if (date < today) date = new Date(now.getFullYear() + 1, month, day)

  return date.toLocaleDateString(LOCALE[lang], { weekday: 'long', day: 'numeric', month: 'long' })
}

// Puesto en el ranking global — mismo criterio que !leveltop (nivel, luego exp).
// Contar a los que van adelante en una pasada, en vez de copiar y ordenar a
// todos los usuarios (2557) para buscar a uno solo.
function getRankPosition(jid: string): number {
  const yo = userData.get(jid)
  if (!yo || (yo.level <= 0 && yo.exp <= 0)) {
    let activos = 0
    for (const u of userData.values()) if (u.level > 0 || u.exp > 0) activos++
    return activos + 1
  }
  let adelante = 0
  for (const u of userData.values()) {
    if (u.level > yo.level || (u.level === yo.level && u.exp > yo.exp)) adelante++
  }
  return adelante + 1
}

const command: Command = {
  name:        'perfil',
  aliases:     ['profile', 'miperfil', 'yo'],
  description: 'Ver perfil propio o de otro (@mencionar o respondiendo su mensaje)',
  category:    'rpg',
  cooldown:    5,

  async execute({ sock, jid, msg, sender, pushName, lang }) {
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

    const lines: string[] = [tx(lang, T.titulo, { n: name }), '']

    const bday       = formatBirthday(user.profile.birth, lang)
    const genreLabel = user.profile.genre === 'm' ? tx(lang, T.hombre)
                      : user.profile.genre === 'f' ? tx(lang, T.mujer)
                      : user.profile.genre === 'o' ? tx(lang, T.otro)
                      : user.profile.genre

    if (bday)              lines.push(tx(lang, T.cumple, { v: bday }))
    if (genreLabel)        lines.push(tx(lang, T.genero, { v: genreLabel }))
    if (user.profile.marry) lines.push(tx(lang, T.casado, { v: user.profile.marry.split('@')[0] }))
    if (bday || genreLabel || user.profile.marry) lines.push('')

    lines.push(
      tx(lang, T.exp, { v: user.exp.toLocaleString() }),
      tx(lang, T.nivel, { v: user.level, rol: user.profile.role }),
      tx(lang, T.progreso, { a: user.exp.toLocaleString(), b: need.toLocaleString(), pct }),
      `   ${bar(user.exp, need)}`,
      tx(lang, T.puesto, { v: rankPos }),
      '',
      `🎀 Harem » *${harem.length.toLocaleString()}*`,
      tx(lang, T.valor, { v: haremValue.toLocaleString() }),
      tx(lang, T.coins, { v: (user.money + user.bank).toLocaleString() }),
      `◆ BrasEmbers » *${user.embers.toLocaleString()}*`,
      tx(lang, T.oro, { v: user.oro.toLocaleString() }),
      tx(lang, T.dragones, { v: user.dragons.length.toLocaleString() }),
      tx(lang, T.comandos, { v: user.commandsUsed.toLocaleString() }),
      '',
      tx(lang, T.salud, { v: saludDe(user) }),
      tx(lang, T.crimen, { v: user.crime }),
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
