import type { Command } from '../../../types/index.js'
import axios from 'axios'
import { USER_AGENT } from '@config'
import { safeSend } from '@lib/media_sender.js'
import { logger } from '@core/logger.js'
import { aMp4 } from '@lib/ffmpeg.js'
import { resolveTarget, fmt } from './_resolve.js'

// #slap: una cachetada con un GIF de anime. Los GIF salen de nekos.best (y de
// nekos.life si esa no contesta), que piden un User-Agent —sin él, 403—, y se
// pasan a MP4: un .gif llega a WhatsApp como archivo, no se reproduce solo.

async function gif(): Promise<Buffer | null> {
  const fuentes: Array<() => Promise<string | undefined>> = [
    async () => (await axios.get('https://nekos.best/api/v2/slap', { timeout: 8_000, headers: { 'User-Agent': USER_AGENT } })).data?.results?.[0]?.url,
    async () => (await axios.get('https://nekos.life/api/v2/img/slap', { timeout: 8_000, headers: { 'User-Agent': USER_AGENT } })).data?.url,
  ]
  for (const f of fuentes) {
    try {
      const url = await f()
      if (!url) continue
      const r = await axios.get<ArrayBuffer>(url, { responseType: 'arraybuffer', timeout: 15_000, headers: { 'User-Agent': USER_AGENT } })
      return Buffer.from(r.data)
    } catch (err) {
      logger.debug({ err }, 'slap: una fuente no contestó')
    }
  }
  return null
}

const command: Command = {
  name:        'slap',
  aliases:     ['cachetada', 'bofetada', 'abofetear'],
  description: 'Le das una cachetada a alguien',
  category:    'roleplay',
  cooldown:    5,

  async execute({ sock, jid, msg, sender, pushName }) {
    const target = await resolveTarget(sock, jid, msg, sender)
    const me     = fmt(pushName, sender)
    const isSelf = target.jid === sender
    const caption = isSelf ? `${me} se dio una cachetada a sí mismo` : `${me} le dio una cachetada a ${target.display}`
    const mentions = isSelf ? [sender] : [sender, target.jid]

    const g = await gif()
    const video = g ? await aMp4(g, 'gif').catch(() => null) : null
    await safeSend(() => sock.sendMessage(jid, video
      ? { video, caption, gifPlayback: true, mentions }
      : { text: `👋 ${caption}`, mentions }, { quoted: msg }))
  },
}

export default command
