import type { Command } from '../../../types/index.js'
import { inspect } from 'util'

const AsyncFn = Object.getPrototypeOf(async function () {}).constructor as new (
  ...args: string[]
) => (...a: unknown[]) => Promise<unknown>

const command: Command = {
  name:        'exec',
  aliases:     ['eval', 'run'],
  description: 'Ejecuta código JavaScript en el contexto del bot',
  category:    'owner',
  ownerOnly:   true,

  async execute({ sock, jid, msg, text, args, sender }) {
    if (!text.trim()) {
      await sock.sendMessage(jid, {
        text: '§ Escribe código JS a ejecutar\nEjemplo: !exec sock.user?.name',
      }, { quoted: msg })
      return
    }

    let result: unknown
    const code = text.trimStart().startsWith('=>')
      ? `return ${text.trimStart().slice(2)}`
      : text

    try {
      const fn = new AsyncFn('sock', 'jid', 'msg', 'args', 'sender', code)
      result = await fn(sock, jid, msg, args, sender)
    } catch (e) {
      result = e
    }

    const output =
      result instanceof Error
        ? `${result.name}: ${result.message}`
        : typeof result === 'string'
        ? result
        : inspect(result, { depth: 3, compact: true })

    await sock.sendMessage(jid, {
      text: String(output ?? 'undefined').slice(0, 3_500),
    }, { quoted: msg })
  },
}

export default command
