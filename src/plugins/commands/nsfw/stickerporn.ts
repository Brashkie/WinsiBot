import type { Command } from '../../../types/index.js'
import { getGroupConfig } from '@core/events.js'
import { makeStickerFromUrl } from '@lib/sticker.js'
import { readFile } from 'fs/promises'
import { cleanTemp } from '@lib/utils.js'
import axios from 'axios'

const IMAGES_URL = 'https://raw.githubusercontent.com/Brashkie/module/refs/heads/main/nsfw/image/sexy.json'

const command: Command = {
  name:        'stickerporn',
  aliases:     ['stickernsfw', 'sticker18'],
  description: 'Sticker +18 aleatorio — requiere nsfw activado',
  category:    'nsfw' as any,
  cooldown:    10,
  groupOnly:   true,

  async execute({ sock, jid, msg, args, prefix }) {
    const config = getGroupConfig(jid)
    if (!config.nsfw) {
      await sock.sendMessage(jid, {
        text: `✗ Los comandos NSFW están desactivados en este grupo.\n\nPide a un admin que active:\n> ${prefix}on nsfw`,
      }, { quoted: msg })
      return
    }

    const images = await axios.get<string[]>(IMAGES_URL, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; WinsiBot/1.0)' },
      timeout: 15_000,
    }).then(r => r.data).catch(() => null)

    if (!Array.isArray(images) || images.length === 0) {
      await sock.sendMessage(jid, { text: '✗ No se encontraron imágenes.' }, { quoted: msg })
      return
    }

    const url = images[Math.floor(Math.random() * images.length)]
    if (!url?.startsWith('http')) {
      await sock.sendMessage(jid, { text: '✗ URL inválida en la lista.' }, { quoted: msg })
      return
    }

    const [pack = 'WinsiBot', author = 'Hepein'] = args
    const stickerPath = await makeStickerFromUrl(url, { pack, author }).catch(() => null)

    if (!stickerPath) {
      await sock.sendMessage(jid, { text: '✗ No se pudo crear el sticker.' }, { quoted: msg })
      return
    }

    const stickerBuf = await readFile(stickerPath)
    await sock.sendMessage(jid, { sticker: stickerBuf }, { quoted: msg })
    await cleanTemp(stickerPath)
  },
}

export default command
