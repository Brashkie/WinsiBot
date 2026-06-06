import type { Command } from '../../../types/index.js'
import { safeSend } from '@lib/media_sender.js'
import { tmpdir } from 'os'
import { existsSync, readdirSync, statSync, unlinkSync, rmdirSync } from 'fs'
import { join } from 'path'

const command: Command = {
  name:        'cleartmp',
  aliases:     ['limpiartmp', 'clearcache'],
  description: 'Limpia archivos temporales',
  category:    'owner',
  ownerOnly:   true,

  async execute({ sock, jid, msg }) {
    const dirs    = [tmpdir(), join(process.cwd(), 'tmp')].filter(existsSync)
    let   deleted = 0
    let   freed   = 0

    for (const dir of dirs) {
      try {
        for (const file of readdirSync(dir)) {
          const path = join(dir, file)
          try {
            const stat = statSync(path)
            freed += stat.size
            if (stat.isDirectory()) {
              rmdirSync(path, { recursive: true } as any)
            } else {
              unlinkSync(path)
            }
            deleted++
          } catch {}
        }
      } catch {}
    }

    const mb = (freed / 1_048_576).toFixed(2)

    await safeSend(() => sock.sendMessage(jid, {
      text: [
        `✔ *Tmp limpiado*`,
        ``,
        `§ Archivos: ${deleted}`,
        `§ Liberado: ${mb} MB`,
      ].join('\n'),
    }, { quoted: msg }))
  },
}

export default command
