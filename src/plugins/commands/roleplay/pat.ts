import type { Command } from '../../../types/index.js'
import axios from 'axios'
import { resolveTarget, fmt } from './_resolve.js'

const VIDEOS = [
  'https://telegra.ph/file/bbdc5ee0c056a3d25e95d.mp4',
  'https://telegra.ph/file/8cd4c0d5b75812d867c30.mp4',
  'https://telegra.ph/file/e92fec68c657321740467.mp4',
  'https://telegra.ph/file/6b53b030fe63ef59f9af2.mp4',
  'https://telegra.ph/file/f4f09b3b424b0f31ba26e.mp4',
  'https://telegra.ph/file/8c78a93d0761ddbe721b8.mp4',
  'https://telegra.ph/file/149f178c1d476677360a5.mp4',
]

const command: Command = {
  name: 'pat',
  aliases: ['acariciar', 'pat1'],
  description: 'Acaricia a alguien',
  category: 'roleplay',
  cooldown: 5,

  async execute({ sock, jid, msg, sender, pushName }) {
    const target  = await resolveTarget(sock, jid, msg, sender)
    const me      = fmt(pushName, sender)
    const isSelf  = target.jid === sender

    const caption = isSelf
      ? `${me} se acarició a sí mismo`
      : `${me} acarició a ${target.display}`

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
