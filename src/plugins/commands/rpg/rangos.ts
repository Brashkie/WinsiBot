import type { Command } from '../../../types/index.js'
import { getUserData, expForLevel } from '@core/events.js'

const RANKS: [number, string, string][] = [
  [0,   'Novato',          '·'],
  [5,   'Aprendiz',        '·'],
  [10,  'Explorador',      '◦'],
  [15,  'Maestro',         '◦'],
  [20,  'Iron I',          '▸'],
  [25,  'Iron II',         '▸'],
  [30,  'Plata I',         '▹'],
  [35,  'Plata II',        '▹'],
  [40,  'Oro I',           '◆'],
  [45,  'Oro II',          '◆'],
  [50,  'Diamante I',      '◈'],
  [55,  'Diamante II',     '◈'],
  [60,  'Pro I',           '✦'],
  [70,  'Pro II',          '✦'],
  [80,  'Leyenda I',       '✧'],
  [90,  'Leyenda II',      '✧'],
  [100, 'Legendario',      '★'],
  [110, 'Estelar I',       '★'],
  [120, 'Estelar II',      '★'],
  [130, 'Top Astral I',    '⟡'],
  [150, 'Top Astral II',   '⟡'],
  [175, 'Elite Global I',  '⌖'],
  [200, 'Elite Global II', '⌖'],
  [250, 'Elite Global III','⌖'],
  [400, 'Elite Global V',  '⌖'],
]

export function getRank(level: number): string {
  let r = RANKS[0]!
  for (const entry of RANKS) {
    if (level >= entry[0]) r = entry
    else break
  }
  return `${r[2]} ${r[1]}`
}

const command = {
  name: 'rangos',
  aliases: ['roles', 'rango', 'rol', 'ranks'],
  description: 'Tabla de rangos',
  category: 'rpg' as const,
  cooldown: 10,

  async execute({ sock, jid, msg, sender, pushName }: any) {
    const user    = getUserData(sender, pushName)
    const current = getRank(user.level)

    const list = RANKS.map(([lvl, name, sym]) => {
      const unlocked = user.level >= lvl
      return `${unlocked ? '✓' : '·'} Nv.${String(lvl).padStart(3)} ${sym} *${name}*`
    }).join('\n')

    await sock.sendMessage(jid, {
      text: `*RANGOS*  _actual: ${current} (Nv.${user.level})_\n\n${list}`,
    }, { quoted: msg })
  },
}

export default command
