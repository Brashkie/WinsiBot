import type { Command } from '../../../types/index.js'
import OpenAI from 'openai'
import { config } from '@config'

const command: Command = {
  name: 'imagine',
  aliases: ['dalle', 'img', 'imagen'],
  description: 'Genera una imagen con DALL-E 3',
  category: 'ai',

  async execute({ sock, jid, msg, args }) {
    if (!config.openaiKey) {
      await sock.sendMessage(jid, { text: '❌ OpenAI no configurado.' }, { quoted: msg })
      return
    }

    const prompt = args.join(' ')
    if (!prompt) {
      await sock.sendMessage(jid, { text: '❌ Uso: !imagine <descripción>' }, { quoted: msg })
      return
    }

    await sock.sendMessage(jid, { text: `🎨 Generando imagen: *${prompt}*...` }, { quoted: msg })

    const ai = new OpenAI({ apiKey: config.openaiKey })

    const result = await ai.images.generate({
      model: 'dall-e-3',
      prompt,
      n: 1,
      size: '1024x1024',
      quality: 'standard',
    }) as { data: Array<{ url: string }> }

    const imageUrl = result.data[0]?.url
    if (!imageUrl) {
      await sock.sendMessage(jid, { text: '❌ No se pudo generar la imagen.' }, { quoted: msg })
      return
    }

    const res = await fetch(imageUrl)
    const buf = Buffer.from(await res.arrayBuffer())

    await sock.sendMessage(jid, {
      image: buf,
      caption: `🎨 *${prompt}*`,
    }, { quoted: msg })
  },
}

export default command