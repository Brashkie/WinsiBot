import type { Command } from '../../../types/index.js'

const EMOJIS = [
  '🤓','😅','😂','😳','😎','🥵','😱','🤑','🙄','💩',
  '🍑','🤨','🥴','🔥','👇','😔','👀','🌚','🗿','💀',
  '🫡','🤡','😈','👑','⚡','🎯','🏆','🎪','🎭','🎰',
]

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!
}

function pickRandomN<T>(arr: T[], n: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5)
  return shuffled.slice(0, n)
}

const command: Command = {
  name: 'top',
  aliases: ['top10', 'ranking'],
  description: 'Genera un top 10 aleatorio con los miembros del grupo',
  category: 'fun',
  groupOnly: true,
  cooldown: 5,

  async execute({ sock, jid, msg, args }) {
    const topic = args.join(' ').trim()

    if (!topic) {
      await sock.sendMessage(jid, {
        text: [
          `✗ Ingresa un tema para el top.`,
          ``,
          `  Uso: #top <tema>`,
          `  Ejemplo: #top los mas guapos del grupo`,
        ].join('\n'),
      }, { quoted: msg })
      return
    }

    const metadata    = await sock.groupMetadata(jid)
    const participants = metadata.participants
    const ids          = participants.map(p => p.id)

    if (ids.length < 2) {
      await sock.sendMessage(jid, {
        text: '✗ No hay suficientes miembros en el grupo.',
      }, { quoted: msg })
      return
    }

    // tomar hasta 10 miembros aleatorios sin repetir
    const selected = pickRandomN(ids, Math.min(10, ids.length))
    const emoji    = pickRandom(EMOJIS)
    const medals   = ['🥇','🥈','🥉','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣','🔟']

    // resolver nombres reales desde groupMetadata
    const lines: string[] = []
    lines.push(`${emoji} *Top ${selected.length} ${topic}* ${emoji}`)
    lines.push(``)

    selected.forEach((id, index) => {
      const num    = (id.split('@')[0] ?? '').replace(/[^0-9]/g, '')
      const medal  = medals[index] ?? `${index + 1}.`
      lines.push(`${medal} @${num}`)
    })

    lines.push(``)
    lines.push(`─────────────────────────`)
    lines.push(`§ Generado aleatoriamente`)

    await sock.sendMessage(jid, {
      text:     lines.join('\n'),
      mentions: selected,
    }, { quoted: msg })
  },
}

export default command