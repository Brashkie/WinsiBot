import type { Command } from '../../../types/index.js'

const command: Command = {
  name: 'follar',
  aliases: ['coger', 'violar'],
  description: 'Comando +18',
  category: 'fun',
  cooldown: 5,

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

    const senderNum = (sender.split('@')[0] ?? '').replace(/[^0-9]/g, '')

    const text = `
@${senderNum} acaba de follarse a *@${targetNum}*!

Te acabas de follar a la perra de @${targetNum} a 4 patas mientras te gemia como una maldita perra "Aaah.., Aaahh, sigue, no pares, no pares.." y la has dejado tan reventada que no puede sostener ni su propio cuerpo la maldita zorra!

@${targetNum} YA TE HAN FOLLADO! 
    `.trim()

    await sock.sendMessage(jid, {
      text,
      mentions: [sender, finalJid],
    }, { quoted: msg })
  },
}

export default command