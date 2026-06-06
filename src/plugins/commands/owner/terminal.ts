import type { Command } from '../../../types/index.js'
import { exec }       from 'child_process'
import { promisify }  from 'util'

const execAsync = promisify(exec)

const command: Command = {
  name:        'terminal',
  aliases:     ['term', 'shell', 'cmd'],
  description: 'Ejecuta un comando en la terminal del servidor',
  category:    'owner',
  ownerOnly:   true,

  async execute({ sock, jid, msg, text }) {
    if (!text.trim()) {
      await sock.sendMessage(jid, {
        text: '§ Escribe el comando a ejecutar\nEjemplo: !terminal ls -la',
      }, { quoted: msg })
      return
    }

    const sent = await sock.sendMessage(jid, {
      text: `⏳ Ejecutando: \`${text.slice(0, 60)}\``,
    }, { quoted: msg })
    const key = sent?.key

    let stdout = ''
    let stderr = ''
    try {
      const r = await execAsync(text, { timeout: 20_000 })
      stdout = r.stdout
      stderr = r.stderr
    } catch (e: any) {
      stdout = e.stdout ?? ''
      stderr = e.stderr ?? e.message ?? String(e)
    }

    const out = [
      stdout.trim() ? `📤 *stdout:*\n\`\`\`${stdout.trim()}\`\`\`` : '',
      stderr.trim() ? `⚠️ *stderr:*\n\`\`\`${stderr.trim()}\`\`\`` : '',
    ].filter(Boolean).join('\n\n') || '_(sin salida)_'

    await sock.sendMessage(jid, {
      text: out.slice(0, 4_000),
      edit: key,
    } as any)
  },
}

export default command
