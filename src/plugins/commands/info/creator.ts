import type { Command } from '../../../types/index.js'
import { config } from '@config'
import { sendWithMedia } from '@lib/media_sender.js'
import os from 'os'

function formatBytes(bytes: number): string {
  if (bytes < 1024)        return `${bytes} B`
  if (bytes < 1024 ** 2)   return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 ** 3)   return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  const parts: string[] = []
  if (d) parts.push(`${d}d`)
  if (h) parts.push(`${h}h`)
  if (m) parts.push(`${m}m`)
  if (s) parts.push(`${s}s`)
  return parts.join(' ') || '0s'
}

const command: Command = {
  name: 'creator',
  aliases: ['info', 'about', 'botinfo', 'creador'],
  description: 'Informacion del bot y su creador',
  category: 'info',

  async execute({ sock, jid, msg }) {
    const mem    = process.memoryUsage()
    const uptime = process.uptime()
    const cpus   = os.cpus()
    const cpu    = cpus[0]?.model ?? 'Desconocido'
    const cores  = cpus.length

    const ramUsed  = formatBytes(mem.heapUsed)
    const ramTotal = formatBytes(mem.heapTotal)
    const rssRam   = formatBytes(mem.rss)

    const lines = [
      `╭═(つ▀¯▀)つ━━━━━━━━━━━━𖡼`,
      `┃ ◆ *${config.botName}*`,
      `┃ by Hepein Oficial`,
      `╰═(つ▀¯▀)つ━━━━━━━━━━━━𖡼`,
      ``,
      ` 𒁈 *CREADOR*`,
      `> Nombre   » Brashkie`,
      `> Alias    » Hepein Oficial 𒁈`,
      `> GitHub   » github.com/Brashkie`,
      `> Proyecto » WinsiBot v8.0.0`,
      ``,
      ` ◈ *BOT*`,
      `> Version  » v8.0.0`,
      `> Prefix   » ${config.prefix.join('  ')}`,
      `> Node.js  » ${process.version}`,
      `> Uptime   » ${formatUptime(uptime)}`,
      ``,
      ` ◈ *SISTEMA*`,
      `> OS       » ${os.type()} ${os.arch()}`,
      `> CPU      » ${cpu.slice(0, 30)}`,
      `> Nucleos  » ${cores}`,
      `> RAM uso  » ${ramUsed} / ${ramTotal}`,
      `> RAM RSS  » ${rssRam}`,
      ``,
      `(つ▀¯▀)つ══════════`,
      `> § WinsiBot — Hepein Oficial 𒁈`,
    ]

    const text = lines.join('\n')
    await sendWithMedia(sock, jid, text, 'creator', msg)
  },
}

export default command