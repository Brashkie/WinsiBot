import type { Command } from '../../../types/index.js'
import OpenAI from 'openai'
import { config } from '@config'
import NodeCache from 'node-cache'

const historyCache = new NodeCache({ stdTTL: 300 })
let openai: OpenAI | null = null

function getOpenAI(): OpenAI {
  if (!openai) openai = new OpenAI({ apiKey: config.openaiKey })
  return openai
}

type Message = { role: 'user' | 'assistant' | 'system'; content: string }

const command: Command = {
  name: 'gpt',
  aliases: ['ai', 'chatgpt', 'ask'],
  description: 'Chatea con GPT-4',
  category: 'ai',

  async execute({ sock, jid, msg, args, sender }) {
    if (!config.openaiKey) {
      await sock.sendMessage(jid, { text: '❌ OpenAI no configurado.' }, { quoted: msg })
      return
    }

    const prompt = args.join(' ')
    if (!prompt) {
      await sock.sendMessage(jid, { text: '❌ Uso: !gpt <mensaje>' }, { quoted: msg })
      return
    }

    const history: Message[] = historyCache.get<Message[]>(sender) ?? [
      {
        role: 'system',
        content: `Eres ${config.botName}, un asistente de WhatsApp útil, directo y amigable. Responde siempre en el idioma del usuario.`,
      },
    ]

    history.push({ role: 'user', content: prompt })

    await sock.sendPresenceUpdate('composing', jid)

    const ai = getOpenAI()
    const completion = await ai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: history,
      max_tokens: 1024,
      temperature: 0.8,
    })

    const reply = completion.choices[0]?.message?.content ?? '❌ Sin respuesta.'

    history.push({ role: 'assistant', content: reply })

    // mantener max 20 mensajes de historial
    if (history.length > 22) history.splice(1, 2)
    historyCache.set(sender, history)

    await sock.sendPresenceUpdate('paused', jid)
    await sock.sendMessage(jid, { text: reply }, { quoted: msg })
  },
}

export default command