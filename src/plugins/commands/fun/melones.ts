import type { Command } from '../../../types/index.js'

// ─── Probabilidades ───────────────────────────────────────────────────────────
interface CupResult {
  cup:     string
  rank:    string
  comment: string
}

// Distribución acumulada (0-100) — copa más común en el medio, extremos raros.
function getMeasurement(): CupResult {
  const rand = Math.random() * 100

  if (rand < 8) return {
    cup:     'AA',
    rank:    'PLANA TOTAL',
    comment: 'tabla de planchar, se nota hasta con abrigo 📏',
  }
  if (rand < 22) return {
    cup:     'A',
    rank:    'DISCRETA',
    comment: 'apenas se asoman, pero ahí están 🌱',
  }
  if (rand < 42) return {
    cup:     'B',
    rank:    'NORMALITA',
    comment: 'ni mucho ni poco, el clásico término medio 😐',
  }
  if (rand < 62) return {
    cup:     'C',
    rank:    'BIEN PUESTA',
    comment: 'se defiende bien, nada que envidiar 😏',
  }
  if (rand < 78) return {
    cup:     'D',
    rank:    'DESTACADA',
    comment: 'ya empiezan a llamar la atención 🔥',
  }
  if (rand < 89) return {
    cup:     'E',
    rank:    'GENEROSA',
    comment: 'ufff, bien formaditas 👀',
  }
  if (rand < 96) return {
    cup:     'F',
    rank:    'EXPLOSIVA',
    comment: 'mamadísimas, cuidado con la espalda 🤯',
  }
  if (rand < 99) return {
    cup:     'G',
    rank:    'MONUMENTAL',
    comment: 'tremendo par, necesitan seguro médico 🚨',
  }
  return {
    cup:     'H',
    rank:    'OTRO NIVEL',
    comment: '¡CHECHOTAS legendarias! esto rompe la escala 👑',
  }
}

const CUP_ORDER = ['AA', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']

function buildBar(cup: string): string {
  const total  = CUP_ORDER.length
  const idx    = CUP_ORDER.indexOf(cup)
  const filled = Math.max(1, Math.round(((idx + 1) / total) * 15))
  const empty  = 15 - filled
  return '(' + '='.repeat(filled) + '░'.repeat(empty) + ')'
}

function getProbText(cup: string): string {
  switch (cup) {
    case 'AA': return 'el 8% de la población — club exclusivo'
    case 'A':  return 'el 14% está en tu situación, tranquila'
    case 'B':  return 'el 20% — el término medio de siempre'
    case 'C':  return 'el 20% — zona cómoda'
    case 'D':  return 'el 16% — ya vas destacando'
    case 'E':  return 'el 11% — nivel generoso'
    case 'F':  return 'el 7% — para presumir'
    case 'G':  return 'el 3% — anomalía de la naturaleza'
    default:   return 'menos del 1% — leyenda viviente'
  }
}

const command: Command = {
  name: 'melones',
  aliases: ['pechos', 'boobs', 'copa'],
  description: 'Mide los melones con probabilidades reales xd',
  category: 'fun',
  cooldown: 5,

  async execute({ sock, jid, msg, sender, pushName }) {
    const ctx        = msg.message?.extendedTextMessage?.contextInfo
    const mentionRaw = ctx?.mentionedJid?.[0]
    const quotedRaw  = ctx?.participant
    const rawTarget  = mentionRaw ?? quotedRaw ?? sender

    let finalJid  = rawTarget
    let targetNum = (rawTarget.split('@')[0] ?? '').replace(/[^0-9]/g, '')

    if (jid.endsWith('@g.us')) {
      try {
        const metadata    = await sock.groupMetadata(jid)
        const participant = metadata.participants.find(p =>
          p.id === rawTarget || (p as any).lid === rawTarget
        )
        if (participant) {
          finalJid  = participant.id
          targetNum = participant.id.split('@')[0] ?? targetNum
        }
      } catch {}
    }

    const result = getMeasurement()
    const bar    = buildBar(result.cup)
    const isMe   = rawTarget === sender

    const lines = [
      `┌───────────────────────`,
      `│ ◆ MEDICION OFICIAL DE MELONES`,
      `└───────────────────────`,
      ``,
      `  § Usuario: @${targetNum}`,
      ``,
      `  ${bar}`,
      ``,
      `  ◈ Talla:    *${result.cup}*`,
      `  ◈ Rango:    *${result.rank}*`,
      ``,
      `  ╰ ${result.comment}`,
      ``,
      `  ───────────────────────`,
      `  § ${getProbText(result.cup)}`,
      ...(isMe ? [`  § te mediste solita/o, que tal xd`] : []),
    ]

    await sock.sendMessage(jid, {
      text:     lines.join('\n'),
      mentions: [finalJid],
    }, { quoted: msg })
  },
}

export default command
