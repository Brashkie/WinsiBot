import type { Command } from '../../../types/index.js'
import axios from 'axios'
import { resolveTarget, fmt } from './_resolve.js'

const VIDEOS = [
  'https://telegra.ph/file/526a85be4b4b8724c39d8.mp4',
  'https://telegra.ph/file/cae7a2816daea40136d01.mp4',
  'https://telegra.ph/file/b66c2f0ced094edf6c73c.mp4',
  'https://telegra.ph/file/7d6d03d019ef4496d27c5.mp4',
  'https://telegra.ph/file/15a2f9e19989a9989ef76.mp4',
  'https://telegra.ph/file/ebab3240bf05403757d72.mp4',
  'https://telegra.ph/file/7aa5ae37a4ef602a784ea.mp4',
  'https://telegra.ph/file/d78a66110b5841bbb8099.mp4',
]

const command: Command = {
  name: 'kill',
  aliases: ['matar', 'kill1'],
  description: 'Mata a alguien',
  category: 'roleplay',
  cooldown: 5,

  async execute({ sock, jid, msg, sender, pushName }) {
    const target  = await resolveTarget(sock, jid, msg, sender)
    const me      = fmt(pushName, sender)
    const isSelf  = target.jid === sender

    const caption = isSelf
      ? `${me} intentó matarse a sí mismo`
      : `${me} mató a ${target.display}`

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
