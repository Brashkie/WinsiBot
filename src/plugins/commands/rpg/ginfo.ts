import type { Command } from '../../../types/index.js'
import { SOURCES, getCharacters, inventory, RW_COOLDOWN, rwCooldowns } from './rollwaifu.js'
import { C_COOLDOWN, cCooldowns } from './claim.js'
import { safeSend } from '@lib/media_sender.js'

function formatTime(ms: number): string {
  const m = Math.floor(ms / 60_000)
  const s = Math.floor((ms % 60_000) / 1000)
  return m > 0 ? `${m}m ${s}s` : `${s}s`
}

function cooldownLine(label: string, cooldowns: Map<string, number>, duration: number, sender: string): string {
  const elapsed = Date.now() - (cooldowns.get(sender) ?? 0)
  const left    = duration - elapsed
  return `${label} » ${left > 0 ? `*${formatTime(left)}*` : '*Ahora*'}`
}

const command: Command = {
  name:        'ginfo',
  aliases:     ['gachainfo', 'rwinfo'],
  description: 'Estadísticas globales del sistema de Roll Waifu + tus cooldowns',
  category:    'rpg',
  cooldown:    10,

  async execute({ sock, jid, msg, sender }) {
    // ─── stats globales — reclamados y valor total, sumando el inventario de TODOS ──
    let totalClaimed = 0
    let totalValue   = 0
    for (const inv of inventory.values()) {
      totalClaimed += inv.length
      for (const c of inv) totalValue += Number(c.value) || 0
    }

    // ─── catálogo — personajes y fuentes reales disponibles ─────────────────
    const perSource = await Promise.all(
      Object.keys(SOURCES).map(async s => ({ source: s, chars: await getCharacters(s).catch(() => []) })),
    )
    const totalChars   = perSource.reduce((sum, s) => sum + s.chars.length, 0)
    const sourceLabels = perSource.map(s => s.chars[0]?.source ?? s.source)

    const lines = [
      `「✦」*Info Global* — Roll Waifu`,
      ``,
      `⏱ *Tus cooldowns:*`,
      `  ${cooldownLine('RollWaifu', rwCooldowns, RW_COOLDOWN, sender)}`,
      `  ${cooldownLine('Claim', cCooldowns, C_COOLDOWN, sender)}`,
      ``,
      `♡ Personajes reclamados » *${totalClaimed.toLocaleString()}*`,
      `☆ Valor total » *${totalValue.toLocaleString()}*`,
      `□ Personajes totales » *${totalChars.toLocaleString()}*`,
      `◆ Fuentes » *${sourceLabels.length}* (${sourceLabels.join(', ')})`,
      ...perSource.map(s => `   ╰ ${s.chars[0]?.source ?? s.source}: ${s.chars.length.toLocaleString()}`),
    ]

    await safeSend(() => sock.sendMessage(jid, { text: lines.join('\n') }, { quoted: msg }))
  },
}

export default command
