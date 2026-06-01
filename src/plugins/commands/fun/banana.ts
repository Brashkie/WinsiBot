import type { Command } from '../../../types/index.js'

// ─── Probabilidades ───────────────────────────────────────────────────────────
interface SizeResult {
  size:    number
  rank:    string
  comment: string
}

function getMeasurement(): SizeResult {
  const rand = Math.random() * 100

  if (rand < 3) return {
    size:    Math.floor(Math.random() * 2) + 1,
    rank:    'INVISIBLE',
    comment: 'necesitas lupa pa verlo brother 🔍',
  }
  if (rand < 10) return {
    size:    Math.floor(Math.random() * 3) + 3,
    rank:    'MICROPENE',
    comment: 'con eso ni las hormigas se impresionan bro 💀',
  }
  if (rand < 25) return {
    size:    Math.floor(Math.random() * 4) + 6,
    rank:    'CHIQUITO',
    comment: 'tranquilo que el amor es lo que importa... dicen 😬',
  }
  if (rand < 55) return {
    size:    Math.floor(Math.random() * 5) + 10,
    rank:    'NORMALITO',
    comment: 'ni pa presumir ni pa esconder, ahí nomás 😐',
  }
  if (rand < 75) return {
    size:    Math.floor(Math.random() * 5) + 15,
    rank:    'DECENTE',
    comment: 'con eso te defiendes en la vida hermano 😏',
  }
  if (rand < 88) return {
    size:    Math.floor(Math.random() * 4) + 20,
    rank:    'GRANDE',
    comment: 'oe con eso andas tranquilo por la vida 😳',
  }
  if (rand < 95) return {
    size:    Math.floor(Math.random() * 4) + 24,
    rank:    'ENORME',
    comment: 'bro con eso rompes la cama y la amistad 💥',
  }
  if (rand < 99) return {
    size:    Math.floor(Math.random() * 3) + 28,
    rank:    'LEGENDARIO',
    comment: 'eso ya no es pito, eso es arma blanca hermano 🏆',
  }
  return {
    size:    Math.floor(Math.random() * 5) + 31,
    rank:    'DIOS DE LOS PITOS',
    comment: 'esto no puede ser real, llamen a la nasa 👑',
  }
}

function buildBar(size: number): string {
  const max    = 35
  const filled = Math.min(Math.round((size / max) * 15), 15)
  const empty  = 15 - filled
  return '8' + '='.repeat(filled) + '░'.repeat(empty) + 'D'
}

function getProbText(size: number): string {
  if (size <= 2)  return 'eres 1 en un millon... pero no en el buen sentido'
  if (size <= 5)  return 'el 3% de la poblacion te entiende'
  if (size <= 9)  return 'el 15% esta en tu situacion, animo'
  if (size <= 14) return 'el 30% de hombres estan contigo'
  if (size <= 19) return 'el 20% — zona comoda'
  if (size <= 23) return 'el 13% — ya vas bien'
  if (size <= 27) return 'el 7% — para presumir en el vestuario'
  if (size <= 30) return 'el 2% — eres una anomalia de la naturaleza'
  return 'menos del 1% — leyenda viviente'
}

const command: Command = {
  name: 'banana',
  aliases: ['bana', 'pito', 'pp', 'miembro', 'pene'],
  description: 'Mide el pito con probabilidades reales xd',
  category: 'fun',
  cooldown: 5,

  async execute({ sock, jid, msg, sender, pushName }) {
    const ctx        = msg.message?.extendedTextMessage?.contextInfo
    const mentionRaw = ctx?.mentionedJid?.[0]
    const quotedRaw  = ctx?.participant
    const rawTarget  = mentionRaw ?? quotedRaw ?? sender

    let finalJid  = rawTarget
    let targetNum = (rawTarget.split('@')[0] ?? '').replace(/[^0-9]/g, '')
    let targetName = pushName || targetNum

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
    const bar    = buildBar(result.size)
    const isMe   = rawTarget === sender

    const lines = [
      `┌───────────────────────`,
      `│ ◆ MEDICION OFICIAL DEL PITO`,
      `└───────────────────────`,
      ``,
      `  § Usuario: @${targetNum}`,
      ``,
      `  ${bar}`,
      ``,
      `  ◈ Medida:  *${result.size} cm*`,
      `  ◈ Rango:   *${result.rank}*`,
      ``,
      `  ╰ ${result.comment}`,
      ``,
      `  ───────────────────────`,
      `  § ${getProbText(result.size)}`,
      ...(isMe ? [`  § te mediste solito, que tal xd`] : []),
    ]

    await sock.sendMessage(jid, {
      text:     lines.join('\n'),
      mentions: [finalJid],
    }, { quoted: msg })
  },
}

export default command