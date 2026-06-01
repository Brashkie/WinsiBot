/*Fue creado por BrashkieBot*/

import type { Command } from '../../../types/index.js'
import axios from 'axios'

const VIDEOS = [
  'https://telegra.ph/file/b6814c2bd8fead1051cee.mp4',
  'https://telegra.ph/file/bbc8ac2b7c0827769d5c7.mp4',
  'https://telegra.ph/file/c9f2c65d2ba87d6f87962.mp4',
  'https://telegra.ph/file/a4f579ce162b62106f933.mp4',
  'https://telegra.ph/file/7db4a7604a2a5b8ce1019.mp4',
  'https://telegra.ph/file/d111a3b3d9accc6073202.mp4',
  'https://telegra.ph/file/ece314cdf9e7bad5f9863.mp4',
  'https://telegra.ph/file/47c80d1ef67c176f400d6.mp4',
]

const command: Command = {
  name: 'hug',
  aliases: ['abrazar', 'abrazo', 'hug1'],
  description: 'Abraza a alguien',
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
    const caption   = `@${senderNum}\` le abrazo a \`*@${targetNum}*`
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