import type { Command } from '../../../types/index.js'
import { getGroupConfig, getUserData, chargeEmbers } from '@core/events.js'
import axios from 'axios'
import { USER_AGENT } from '@config'

const VIDEOS_URL = 'https://raw.githubusercontent.com/Brashkie/module/refs/heads/main/nsfw/video/adult.json'
const EMBER_COST = 1

import { sleep } from '@lib/utils.js'

const command: Command = {
  name: 'porn',
  aliases: ['porngif'],
  description: 'Video para adultos — requiere nsfw activado',
  category: 'nsfw' as any,
  cooldown: 10,
  groupOnly: true,

  async execute({ sock, jid, msg, prefix, sender }) {
    // verificar si nsfw esta activado en el grupo
    const groupConfig = getGroupConfig(jid)
    if (!groupConfig.nsfw) {
      await sock.sendMessage(jid, {
        text: `✗ Los comandos NSFW estan desactivados en este grupo.\n\nPide a un admin que active:\n> ${prefix}on nsfw`,
      }, { quoted: msg })
      return
    }

    if (!chargeEmbers(sender, EMBER_COST)) {
      await sock.sendMessage(jid, {
        text: `✗ Te faltan BrasEmbers — necesitás *${EMBER_COST}* y tenés *${getUserData(sender).embers}*.\n§ Conseguí más con ${prefix}ascuas, o una chance random en ${prefix}daily/${prefix}work/${prefix}crime/${prefix}mine.`,
      }, { quoted: msg })
      return
    }

    // animacion
    const sent  = await sock.sendMessage(jid, { text: '◈ Buscando contenido...' }, { quoted: msg })
    const key   = sent?.key
    const frames = [
      '◈◈ Obteniendo lista...',
      '◈◈◈ Seleccionando video...',
      '◈◈ Descargando...',
    ]

    const [videos] = await Promise.all([
      axios.get<string[]>(VIDEOS_URL, {
        headers: { 'User-Agent': USER_AGENT },
        timeout: 15_000,
      }).then(r => r.data).catch(() => null),
      (async () => {
        for (const frame of frames) {
          await sleep(400)
          await sock.sendMessage(jid, { text: frame, edit: key } as any)
        }
      })(),
    ])

    if (!Array.isArray(videos) || videos.length === 0) {
      await sock.sendMessage(jid, {
        text: '✗ No se encontraron videos.',
        edit: key,
      } as any)
      return
    }

    const url = videos[Math.floor(Math.random() * videos.length)]

    if (!url?.startsWith('http')) {
      await sock.sendMessage(jid, {
        text: '✗ URL invalida.',
        edit: key,
      } as any)
      return
    }

    const res    = await axios.get<ArrayBuffer>(url, {
      responseType: 'arraybuffer',
      timeout:      20_000,
    })
    const buffer  = Buffer.from(res.data)
    const caption = `◆ Video adulto\n§ ${videos.length} videos disponibles`

    await sock.sendMessage(jid, { text: '✔ Listo', edit: key } as any)
    await sleep(200)

    await sock.sendMessage(jid, {
      video:       buffer,
      caption,
      gifPlayback: true,
    }, { quoted: msg })
  },
}

export default command