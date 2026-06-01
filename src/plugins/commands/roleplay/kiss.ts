/*Fue creado por BrashkieBot*/

import type { Command } from '../../../types/index.js'
import axios from 'axios'

const VIDEOS = [
  'https://telegra.ph/file/63c8cc3cc497e6835b188.mp4',
  'https://telegra.ph/file/9651fa12f8b272afaf364.mp4',
  'https://telegra.ph/file/e1d573470c7b848ad1c59.mp4',
  'https://telegra.ph/file/0436ce6db32656eccb2f3.mp4',
  'https://telegra.ph/file/e58467fd29080d65fc15d.mp4',
]

const command: Command = {
  name: 'kiss',
  aliases: ['beso', 'kiss1'],
  description: 'Besa a alguien',
  category: 'roleplay',
  cooldown: 5,

  async execute({ sock, jid, msg, sender }) {
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
    const caption   = `@${senderNum} le beso a *@${targetNum}*`
    const url       = VIDEOS[Math.floor(Math.random() * VIDEOS.length)]!

    const res    = await axios.get<ArrayBuffer>(url, { responseType: 'arraybuffer', timeout: 15_000 })
    const buffer = Buffer.from(res.data)

    await sock.sendMessage(jid, {
      video:       buffer,
      caption,
      gifPlayback: true,
      mentions:    [sender, finalJid],
    }, { quoted: msg })
  },
}

export default command