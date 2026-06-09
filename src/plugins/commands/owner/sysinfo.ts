import type { Command } from '../../../types/index.js'
import { execSync }   from 'child_process'
import os            from 'os'
import { readFileSync, existsSync } from 'fs'
import { join }      from 'path'

// ─────────────────────────────────────────────────────────────────────────────
//  !sysinfo — panel de estado del sistema y servicios
// ─────────────────────────────────────────────────────────────────────────────

const SERVICES = [
  { name: 'Flask',  url: 'http://127.0.0.1:5000/health' },
  { name: 'Rust',   url: 'http://127.0.0.1:3001/health/live' },
]

function fmtUptime(ms: number): string {
  const s = Math.floor(ms / 1000)
  const d = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  const parts = [d && `${d}d`, h && `${h}h`, m && `${m}m`].filter(Boolean)
  return parts.length ? parts.join(' ') : '<1m'
}

function fmtMB(bytes: number): string {
  return `${(bytes / 1_048_576).toFixed(0)} MB`
}

function getBotVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8'))
    return pkg.version ?? '?'
  } catch {
    return '?'
  }
}

function getGitCommit(): string {
  try {
    return execSync('git rev-parse --short HEAD', { timeout: 2_000 }).toString().trim()
  } catch {
    return '?'
  }
}

async function pingService(url: string): Promise<string> {
  const t0 = Date.now()
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(1_500) })
    return r.ok ? `🟢 ${Date.now() - t0}ms` : '🟡 error'
  } catch {
    return '🔴 offline'
  }
}

const command: Command = {
  name:        'sysinfo',
  aliases:     ['system', 'info', 'servidor', 'estado'],
  description: 'Información del sistema y estado de servicios',
  category:    'owner',
  ownerOnly:   true,

  async execute({ sock, jid, msg }) {
    const sent = await sock.sendMessage(jid, {
      text: '⏳ Recopilando información...',
    }, { quoted: msg })
    const key = sent?.key

    // Sistema
    const mem      = process.memoryUsage()
    const totalRAM = os.totalmem()
    const freeRAM  = os.freemem()
    const usedRAM  = totalRAM - freeRAM
    const cpuLoad  = os.loadavg()[0]?.toFixed(2) ?? '?'
    const platform = `${os.type()} ${os.release()}`
    const nodeVer  = process.version
    const botVer   = getBotVersion()
    const commit   = getGitCommit()
    const uptime   = fmtUptime(process.uptime() * 1000)
    const osUptime = fmtUptime(os.uptime() * 1000)

    // Pings a servicios
    const pings = await Promise.all(
      SERVICES.map(async s => `  ${await pingService(s.url)} · *${s.name}*`)
    )

    const text = [
      `┌──────────────────────────`,
      `│  ◈ *ESTADO DEL SISTEMA*`,
      `└──────────────────────────`,
      ``,
      `*🤖 Bot*`,
      `  § Versión: \`v${botVer}\`  (\`${commit}\`)`,
      `  § Uptime:  ${uptime}`,
      `  § Node.js: ${nodeVer}`,
      ``,
      `*💾 Memoria*`,
      `  § RAM total:  ${fmtMB(totalRAM)}`,
      `  § RAM usada:  ${fmtMB(usedRAM)} (${((usedRAM / totalRAM) * 100).toFixed(0)}%)`,
      `  § Heap bot:   ${fmtMB(mem.heapUsed)} / ${fmtMB(mem.heapTotal)}`,
      ``,
      `*🖥️ Sistema*`,
      `  § OS:        ${platform}`,
      `  § CPU load:  ${cpuLoad}`,
      `  § OS uptime: ${osUptime}`,
      ``,
      `*🔌 Servicios*`,
      ...pings,
      ``,
      `──────────────────────────`,
      `  \`!services\` para controlar servicios`,
    ].join('\n')

    await sock.sendMessage(jid, { text, edit: key } as any)
  },
}

export default command
