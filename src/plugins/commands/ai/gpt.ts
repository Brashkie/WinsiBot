import type { Command } from '../../../types/index.js'
import OpenAI from 'openai'
import { config } from '@config'
import NodeCache from 'node-cache'

const historyCache = new NodeCache({ stdTTL: 300 })
const MAX_REPLY    = 4000   // límite práctico para WhatsApp
const MAX_PROMPT   = 2000   // evitar tokens innecesarios

let openai: OpenAI | null = null
function getOpenAI(): OpenAI {
  if (!openai) openai = new OpenAI({ apiKey: config.openaiKey })
  return openai
}

type Message = { role: 'user' | 'assistant' | 'system'; content: string }

const command: Command = {
  name: 'gpt',
  aliases: ['ai', 'chatgpt', 'ask', 'gptreset'],
  description: 'Chatea con GPT-4 | !gptreset para borrar historial',
  category: 'ai',

  async execute({ sock, jid, msg, args, sender, command: cmd }) {
    if (!config.openaiKey) {
      await sock.sendMessage(jid, { text: '❌ OpenAI no configurado.' }, { quoted: msg })
      return
    }

    // Limpiar historial
    if (cmd === 'gptreset') {
      historyCache.del(sender)
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

    const history: Message[] = historyCache.get<Message[]>(sender) ?? [
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
      const completion = await getOpenAI().chat.completions.create({
        model:       'gpt-4o-mini',
        messages:    history,
        max_tokens:  1024,
        temperature: 0.8,
      })

      let reply = completion.choices[0]?.message?.content?.trim() ?? '❌ Sin respuesta.'
      if (reply.length > MAX_REPLY) reply = reply.slice(0, MAX_REPLY) + '…'

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
