import type { Command } from '../../../types/index.js'
import { config } from '@config'
import { sendWithMedia } from '@lib/media_sender.js'
import { commandRegistry } from '../index.js'
import { readFileSync } from 'fs'
import { join } from 'path'

function getBotVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8'))
    return pkg.version ?? '?'
  } catch {
    return '?'
  }
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const parts: string[] = []
  if (d) parts.push(`${d}d`)
  if (h) parts.push(`${h}h`)
  parts.push(`${m}m`)
  return parts.join(' ')
}

const command: Command = {
  name:        'infobot',
  aliases:     ['botstatus', 'enterprise'],
  description: 'Tarjeta de identidad del bot — versión, estado y características',
  category:    'info',

  async execute({ sock, jid, msg }) {
    const totalCommands = new Set([...commandRegistry.values()].map(c => c.name)).size

    const text = [
      `*${config.botName.toUpperCase()}*`,
      `_Enterprise WhatsApp Bot_`,
      ``,
      `> Powerful. Secure. Intelligent.`,
      ``,
      `🛡 Secure       — sesión cifrada, anti-ban`,
      `⚡ Fast         — Node.js + Rust + Python`,
      `🧠 Intelligent  — IA conversacional integrada`,
      `🌐 Enterprise   — multi-bot, multi-sesión`,
      ``,
      `◆ Versión   » v${getBotVersion()}`,
      `◆ Comandos  » ${totalCommands}`,
      `◆ Uptime    » ${formatUptime(process.uptime())}`,
      `◆ Prefix    » ${config.prefix.join('  ')}`,
    ].join('\n')

    await sendWithMedia(sock, jid, text, 'WinsiBot', msg)
  },
}

export default command
