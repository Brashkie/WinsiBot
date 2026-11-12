import type { Command } from '../../../types/index.js'
import { chat, type Mensaje } from '@lib/openai.js'
import { config } from '@config'
import { createCache, registerCache } from '@lib/cacheManager.js'
import { chatLocal } from '@lib/localChat.js'

// Primero la IA de esta máquina (el Qwen de Cosxamix, ver localChat.ts), sin
// API ni clave; si no contesta, GPT-4o-mini de OpenAI, si hay clave. El
// historial es el mismo para los dos.

// stdTTL de NodeCache iba en segundos; la Cache del cacheManager usa ms.
// maxSize acota el historial a los 300 usuarios más activos — NodeCache no
// tenía tope y con 2500+ usuarios el historial podía crecer sin límite.
const historyCache = registerCache('gptHistory', createCache<Message[]>({ ttl: 300_000, maxSize: 300 }))
const MAX_REPLY    = 4000   // límite práctico para WhatsApp
const MAX_PROMPT   = 2000   // evitar tokens innecesarios


type Message = { role: 'user' | 'assistant' | 'system'; content: string }

const command: Command = {
  name: 'gpt',
  aliases: ['ai', 'chatgpt', 'ask', 'gptreset'],
  description: 'Chatea con la IA de este bot (o GPT-4o-mini) | !gptreset para borrar historial',
  category: 'ai',

  async execute({ sock, jid, msg, args, sender, command: cmd }) {
    // Limpiar historial
    if (cmd === 'gptreset') {
      historyCache.delete(sender)
      await sock.sendMessage(jid, { text: '🗑 Historial borrado.' }, { quoted: msg })
      return
    }

    const prompt = args.join(' ').trim()
    if (!prompt) {
      await sock.sendMessage(jid, {
        text: `❌ Uso: \`!gpt <mensaje>\`\n> Para borrar historial: \`!gptreset\``,
      }, { quoted: msg })
      return
    }

    if (prompt.length > MAX_PROMPT) {
      await sock.sendMessage(jid, {
        text: `❌ Mensaje demasiado largo (máx ${MAX_PROMPT} caracteres).`,
      }, { quoted: msg })
      return
    }

    const history: Message[] = historyCache.get(sender) ?? [
      {
        role:    'system',
        content: `Eres ${config.botName}, asistente de WhatsApp inteligente y conciso. `
               + `Responde siempre en el idioma del usuario. `
               + `Sé directo y útil. Máximo 3 párrafos por respuesta.`,
      },
    ]

    history.push({ role: 'user', content: prompt })
    await sock.sendPresenceUpdate('composing', jid)

    try {
      // La IA local: ~15 tokens por segundo con el 3B en CPU, así que 512 de
      // tope (unos 35 s) y no los 1024 de OpenAI.
      let respuesta = await chatLocal(history, { max_tokens: 512, temperature: 0.8 })
      if (!respuesta) {
        if (!config.openaiKey) {
          history.pop()
          await sock.sendPresenceUpdate('paused', jid)
          await sock.sendMessage(jid, {
            text: '❌ La IA de este bot no está disponible ahora (¿Cosxamix cargando?) y no hay clave de OpenAI.',
          }, { quoted: msg })
          return
        }
        respuesta = (await chat(history as Mensaje[], {
          model:       'gpt-4o-mini',
          max_tokens:  1024,
          temperature: 0.8,
        })) ?? null
      }

      let reply = respuesta?.trim() || '❌ Sin respuesta.'
      if (reply.length > MAX_REPLY) reply = `${reply.slice(0, MAX_REPLY)}…`

      history.push({ role: 'assistant', content: reply })
      // mantener max 20 mensajes (1 system + 19 pares)
      if (history.length > 21) history.splice(1, 2)
      historyCache.set(sender, history)

      await sock.sendPresenceUpdate('paused', jid)
      await sock.sendMessage(jid, { text: reply }, { quoted: msg })

    } catch (err: any) {
      await sock.sendPresenceUpdate('paused', jid)

      const status = err?.status ?? err?.code
      const errText = status === 429
        ? '⏳ Límite de OpenAI alcanzado. Intenta en un momento.'
        : status === 401
        ? '🔑 API key de OpenAI inválida o expirada.'
        : status === 503
        ? '🔧 OpenAI no disponible temporalmente.'
        : `❌ Error: ${err?.message ?? 'desconocido'}`

      await sock.sendMessage(jid, { text: errText }, { quoted: msg })
    }
  },
}

export default command
