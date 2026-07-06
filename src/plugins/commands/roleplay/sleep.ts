import type { Command } from '../../../types/index.js'
import axios from 'axios'
import { resolveTarget, fmt } from './_resolve.js'

const BASE  = 'https://raw.githubusercontent.com/Brashkie/module/main/download/anime/vid/role/sleep'
const TOTAL = 40

const command: Command = {
  name: 'sleep',
  aliases: ['dormir', 'duerme'],
  description: 'Se queda dormido (o hace dormir a alguien)',
  category: 'roleplay',
  cooldown: 5,

  async execute({ sock, jid, msg, sender, pushName }) {
    const target = await resolveTarget(sock, jid, msg, sender)
    const me     = fmt(pushName, sender)
    const isSelf = target.jid === sender

    const caption = isSelf
      ? `${me} se quedó dormido 😴`
      : `${me} hizo dormir a ${target.display} 😴`

    const n   = String(Math.floor(Math.random() * TOTAL) + 1).padStart(6, '0')
    const url = `${BASE}/${n}.mp4`
    const res = await axios.get<ArrayBuffer>(url, { responseType: 'arraybuffer', timeout: 15_000 })

    await sock.sendMessage(jid, {
      video:       Buffer.from(res.data),
      caption,
      gifPlayback: true,
      mentions:    isSelf ? [sender] : [sender, target.jid],
    }, { quoted: msg })
  },
}

export default command
