import type { Command } from '../../../types/index.js'
import { imagen } from '@lib/openai.js'
import { config } from '@config'

const command: Command = {
  name: 'imagine',
  aliases: ['dalle'],
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

    const imageUrl = await imagen(prompt)
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