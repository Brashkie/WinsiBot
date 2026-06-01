import type { Command } from '../../../types/index.js'
import axios from 'axios'

const MEME_JSON = 'https://raw.githubusercontent.com/Brashkie/module/refs/heads/main/public/random/meme.json'

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

const command: Command = {
  name: 'meme',
  aliases: ['memes', 'randommeme'],
  description: 'Envia un meme aleatorio',
  category: 'fun',
  cooldown: 5,

  async execute({ sock, jid, msg }) {
    // ─── Fase 1: animacion de busqueda ────────────────────────────────────────
    const frames = [
      '◈ Buscando meme...',
      '◈◈ Buscando meme...',
      '◈◈◈ Buscando meme...',
      '◈◈ Buscando meme...',
    ]

    const sent    = await sock.sendMessage(jid, { text: frames[0]! }, { quoted: msg })
    const sentKey = sent?.key

    for (let i = 1; i < frames.length; i++) {
      await sleep(400)
      await sock.sendMessage(jid, {
        text: frames[i]!,
        edit: sentKey,
      } as any)
    }

    await sleep(300)

    // ─── Fase 2: obtener meme ─────────────────────────────────────────────────
    await sock.sendMessage(jid, {
      text: '▣ Descargando...',
      edit: sentKey,
    } as any)

    const res = await axios.get<string[]>(MEME_JSON, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; WinsiBot/1.0)' },
      timeout: 15_000,
    })

    const memes = res.data

    if (!Array.isArray(memes) || memes.length === 0) {
      await sock.sendMessage(jid, {
        text: '✗ No se encontraron memes.',
        edit: sentKey,
      } as any)
      return
    }

    const url = memes[Math.floor(Math.random() * memes.length)]

    if (!url?.startsWith('http')) {
      await sock.sendMessage(jid, {
        text: '✗ URL invalida.',
        edit: sentKey,
      } as any)
      return
    }

    const imgRes = await axios.get<ArrayBuffer>(url, {
      responseType: 'arraybuffer',
      timeout: 15_000,
    })
    const buffer = Buffer.from(imgRes.data)

    // ─── Fase 3: enviar imagen ────────────────────────────────────────────────
    await sleep(200)

    const caption = `◆ Meme aleatorio\n§ ${memes.length} memes disponibles`

    await sock.sendMessage(jid, {
      image:   buffer,
      caption,
    }, { quoted: msg })
  },
}

export default command