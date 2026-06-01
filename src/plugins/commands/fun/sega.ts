import type { Command } from '../../../types/index.js'

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

const command: Command = {
  name: 'sega',
  aliases: ['fap', 'paja', 'pajear', 'chaquetita', 'ganzo'],
  description: 'Animacion divertida',
  category: 'fun',
  cooldown: 10,

  async execute({ sock, jid, msg, args, sender, pushName }) {
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

    const targetName = args.filter(a => !a.startsWith('@')).join(' ').trim()
                    || pushName
                    || targetNum
                    || 'alguien'

    const sent = await sock.sendMessage(jid, {
      text: `Ahora le voy a hacer una paja a @${targetNum}`,
      mentions: [finalJid],
    }, { quoted: msg })

    const key = sent?.key

    const frames = [
      '8==👊==D', '8===👊=D', '8=👊===D', '8=👊===D', '8==👊==D',
      '8===👊=D', '8=👊===D', '8==👊==D', '8===👊=D', '8=👊===D',
      '8==👊==D', '8===👊=D', '8===👊=D💦',
    ]

    for (const frame of frames) {
      await sleep(250)
      await sock.sendMessage(jid, { text: frame, edit: key } as any)
    }

    await sleep(300)

    await sock.sendMessage(jid, {
      text:     `Oh @${targetNum} se corrio! 💦`,
      edit:     key,
      mentions: [finalJid],
    } as any)
  },
}

export default command