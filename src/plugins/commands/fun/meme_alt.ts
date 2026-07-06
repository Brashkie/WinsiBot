import type { Command } from '../../../types/index.js'
import axios from 'axios'

const MEME_PE_URL = 'https://raw.githubusercontent.com/Brashkie/module/refs/heads/main/public/random/meme_pe.json'

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

const command: Command = {
  name: 'memepe',
  aliases: ['mecausa', 'memeperu', 'memeperú'],
  description: 'Envia un meme peruano aleatorio',
  category: 'fun',
  cooldown: 5,

  async execute({ sock, jid, msg }) {
    const sent = await sock.sendMessage(jid, {
      text: '◈ Buscando meme peruano...',
    }, { quoted: msg })
    const key = sent?.key

    const frames = [
      '◈◈ Buscando meme peruano...',
      '◈◈◈ Buscando meme peruano...',
      '◈◈ Buscando meme peruano...',
    ]

    for (let i = 0; i < frames.length; i++) {
      await sleep(400)
      await sock.sendMessage(jid, {
        text: frames[i]!,
        edit: key,
      } as any)
    }

    await sleep(300)

    await sock.sendMessage(jid, {
      text: '▣ Descargando...',
      edit: key,
    } as any)

    const res = await axios.get<string[]>(MEME_PE_URL, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; WinsiBot/1.0)' },
      timeout: 15_000,
    })

    const memes = res.data

    if (!Array.isArray(memes) || memes.length === 0) {
      await sock.sendMessage(jid, {
        text: '✗ No se encontraron memes peruanos.',
        edit: key,
      } as any)
      return
    }

    const url = memes[Math.floor(Math.random() * memes.length)]

    if (!url?.startsWith('http')) {
      await sock.sendMessage(jid, {
        text: '✗ URL invalida.',
        edit: key,
      } as any)
      return
    }

    const imgRes = await axios.get<ArrayBuffer>(url, {
      responseType: 'arraybuffer',
      timeout:      15_000,
    })
    const buffer  = Buffer.from(imgRes.data)
    const caption = [
      `◆ Meme peruano`,
      `§ ${memes.length} memes disponibles`,
      ``,
      `> ¡Me causa! 😂🇵🇪`,
    ].join('\n')

    await sleep(200)

    await sock.sendMessage(jid, {
      image:   buffer,
      caption,
    }, { quoted: msg })
  },
}

export default command