import type { Command } from '../../../types/index.js'
import axios from 'axios'
import { resolveTarget, fmt } from './_resolve.js'

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

  async execute({ sock, jid, msg, sender, pushName }) {
    const target  = await resolveTarget(sock, jid, msg, sender)
    const me      = fmt(pushName, sender)
    const isSelf  = target.jid === sender

    const caption = isSelf
      ? `${me} se besó a sí mismo`
      : `${me} besó a ${target.display}`

    const url    = VIDEOS[Math.floor(Math.random() * VIDEOS.length)]!
    const res    = await axios.get<ArrayBuffer>(url, { responseType: 'arraybuffer', timeout: 15_000 })
    const buffer = Buffer.from(res.data)

    await sock.sendMessage(jid, {
      video:       buffer,
      caption,
      gifPlayback: true,
      mentions:    isSelf ? [sender] : [sender, target.jid],
    }, { quoted: msg })
  },
}

export default command
