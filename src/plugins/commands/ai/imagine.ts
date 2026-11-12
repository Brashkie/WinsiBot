import type { Command } from '../../../types/index.js'
import { imagen } from '@lib/openai.js'
import { config } from '@config'
import { aIngles, imagenLocal } from '@lib/localImage.js'
import { convertirImagen } from '@lib/imageApi.js'

// Primero en esta máquina, sin API (SD-Turbo en Cosxamix, ver localImage.ts);
// si no hay modelo de imágenes, DALL-E 3 con la clave de OpenAI, como antes.
//
// SD-Turbo: Stability AI Community License. Gratis para uso no comercial, y
// pide mostrar "Powered by Stability AI": va en el pie de cada imagen.

const command: Command = {
  name: 'imagine',
  aliases: ['dalle', 'crear'],
  description: 'Crea una imagen a partir de un texto, en esta máquina (SD-Turbo) o con DALL-E 3',
  category: 'ai',

  async execute({ sock, jid, msg, args }) {
    const prompt = args.join(' ').trim()
    if (!prompt) {
      await sock.sendMessage(jid, { text: '❌ Uso: !imagine <descripción>' }, { quoted: msg })
      return
    }

    await sock.sendMessage(jid, { text: `🎨 Creando: *${prompt}*...` }, { quoted: msg })

    // ── En esta máquina ────────────────────────────────────────────────────
    const ingles = await aIngles(prompt)
    const local = await imagenLocal(ingles)
    if (local) {
      // El PNG sale de Cosxamix sin comprimir (~770 KB): a JPEG, ~70 KB.
      const foto = await convertirImagen(local.png, 'jpeg', 90).catch(() => local.png)
      const segundos = local.ms ? ` · ${(local.ms / 1000).toFixed(0)} s` : ''
      await sock.sendMessage(jid, {
        image: foto,
        caption: `🎨 *${prompt}*\n> SD-Turbo en este bot${segundos} · Powered by Stability AI`,
      }, { quoted: msg })
      return
    }

    // ── DALL-E, si hay clave ───────────────────────────────────────────────
    if (!config.openaiKey) {
      await sock.sendMessage(jid, {
        text: '❌ No hay modelo de imágenes en este bot (falta *sd-turbo* en la carpeta de modelos de Cosxamix) ni clave de OpenAI.',
      }, { quoted: msg })
      return
    }
    const imageUrl = await imagen(prompt)
    if (!imageUrl) {
      await sock.sendMessage(jid, { text: '❌ No se pudo generar la imagen.' }, { quoted: msg })
      return
    }
    const res = await fetch(imageUrl)
    const buf = Buffer.from(await res.arrayBuffer())
    await sock.sendMessage(jid, { image: buf, caption: `🎨 *${prompt}*` }, { quoted: msg })
  },
}

export default command
