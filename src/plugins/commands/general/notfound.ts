/*import type { BotContext } from '../../../types/index.js'
import { commandRegistry } from '../index.js'

// ─── Distancia de Levenshtein para sugerencias más precisas ──────────────────
function levenshtein(a: string, b: string): number {
  const dp: number[][] = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  )
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i]![j] = a[i - 1] === b[j - 1]
        ? dp[i - 1]![j - 1]!
        : 1 + Math.min(dp[i - 1]![j]!, dp[i]![j - 1]!, dp[i - 1]![j - 1]!)
    }
  }
  return dp[a.length]![b.length]!
}

function findSimilar(input: string, prefix: string): string[] {
  return [...commandRegistry.values()]
    .map(cmd => ({
      name: cmd.name,
      dist: levenshtein(input, cmd.name),
      alias: cmd.aliases?.some(a => levenshtein(input, a) <= 2),
    }))
    .filter(c => c.dist <= 3 || c.alias)
    .sort((a, b) => a.dist - b.dist)
    .slice(0, 3)
    .map(c => `${prefix}${c.name}`)
}

export async function handleNotFound(ctx: BotContext): Promise<void> {
  const { sock, jid, msg, command, prefix } = ctx
  const similar = findSimilar(command, prefix)

  const lines: string[] = []

  lines.push(`┌─────────────────────────`)
  lines.push(`│  Comando no encontrado`)
  lines.push(`│  *${prefix}${command}*`)
  lines.push(`└─────────────────────────`)

  if (similar.length > 0) {
    lines.push(``)
    lines.push(`  ◈ Quisiste decir?`)
    similar.forEach(s => lines.push(`    ╰ ${s}`))
  }

  lines.push(``)
  lines.push(`  § Ver todos: *${prefix}menu*`)

  await sock.sendMessage(jid, {
    text: lines.join('\n'),
  }, { quoted: msg })
}*/

import type { BotContext } from '../../../types/index.js'

export async function handleNotFound(ctx: BotContext): Promise<void> {
  const { sock, jid, msg, command, prefix } = ctx

  await sock.sendMessage(jid, {
    text: [
      `𒁈 El comando *${prefix}${command}* no existe.`,
      `Para ver la lista de comandos usa:`,
      `> *${prefix}help*`,
    ].join('\n'),
  }, { quoted: msg })
}