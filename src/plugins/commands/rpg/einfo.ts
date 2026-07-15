import type { Command } from '../../../types/index.js'
import { getUserData, isOnCooldown, getCooldownLeft, isOnCooldownDaily, getDailyCooldownLeft } from '@core/events.js'
import { safeSend } from '@lib/media_sender.js'

// Duraciones de cada comando (deben coincidir con los archivos originales).
// ms: null → cooldown "diario" (se reinicia a medianoche UTC, no ms fijos —
// ver daily.ts/chest.ts e isOnCooldownDaily en events/index.ts).
const CDS: Array<{ label: string; key: Parameters<typeof isOnCooldown>[1]; ms: number | null }> = [
  { label: 'Work',    key: 'lastWork'   as const, ms: 10 * 60_000       },
  { label: 'Slut',    key: 'lastHunt'   as const, ms: 60 * 60_000       },
  { label: 'Crime',   key: 'lastCrime'  as const, ms: 60 * 60_000       },
  { label: 'Daily',   key: 'lastClaim'  as const, ms: null              },
  { label: 'Weekly',  key: 'lastWeekly' as const, ms: 7 * 24 * 60 * 60_000 },
  { label: 'Rob',     key: 'lastRob'    as const, ms: 2  * 60 * 60_000  },
  { label: 'Cofre',   key: 'lastCofre'  as const, ms: null              },
]

function fmtLeft(ms: number): string {
  if (ms <= 0) return '*Ahora.*'
  const totalS = Math.floor(ms / 1000)
  const h      = Math.floor(totalS / 3600)
  const m      = Math.floor((totalS % 3600) / 60)
  const s      = totalS % 60
  const parts  = [
    h > 0 && `${h} hora${h > 1 ? 's' : ''}`,
    m > 0 && `${m} minuto${m > 1 ? 's' : ''}`,
    s > 0 && `${s} segundo${s > 1 ? 's' : ''}`,
  ].filter(Boolean) as string[]
  return parts.join(' ')
}

const command: Command = {
  name:        'einfo',
  aliases:     ['econinfo', 'cooldowns', 'cds', 'timers'],
  description: 'Ver cooldowns de tus comandos de economía',
  category:    'rpg',
  cooldown:    5,

  async execute({ sock, jid, msg, sender, pushName }) {
    const user  = getUserData(sender, pushName)
    const name  = user.name || pushName || sender.split('@')[0]
    const total = user.money + user.bank

    const rows = CDS.map(({ label, key, ms }) => {
      const left = ms === null
        ? (isOnCooldownDaily(sender, key) ? getDailyCooldownLeft() : 0)
        : (isOnCooldown(sender, key, ms) ? getCooldownLeft(sender, key, ms) : 0)
      return `✘ *${label}* » ${fmtLeft(left)}`
    })

    await safeSend(() => sock.sendMessage(jid, {
      text: [
        `✧ ))Economia @~${name}(( ✧`,
        ``,
        rows.join('\n'),
        ``,
        `🏧 *Coins totales* » ¥${total.toLocaleString()} CodPoints`,
      ].join('\n'),
    }, { quoted: msg }))
  },
}

export default command
