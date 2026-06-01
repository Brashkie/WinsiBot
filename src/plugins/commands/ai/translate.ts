import type { Command } from '../../../types/index.js'
import { translate } from '@vitalets/google-translate-api'

const command: Command = {
  name: 'traducir',
  aliases: ['tl', 'translate', 'tr'],
  description: 'Traduce texto a cualquier idioma',
  category: 'ai',

  async execute({ sock, jid, msg, args }) {
    if (args.length < 2) {
      await sock.sendMessage(jid, {
        text: '❌ Uso: !traducir <idioma> <texto>\nEjemplo: !traducir en Hola mundo',
      }, { quoted: msg })
      return
    }

    const [lang, ...rest] = args
    const text = rest.join(' ')

    const result = await translate(text, { to: lang! })

    await sock.sendMessage(jid, {
      text: `🌐 *Traducción (${lang})*\n\n${result.text}`,
    }, { quoted: msg })
  },
}

export default command