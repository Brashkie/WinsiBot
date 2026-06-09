import type { WASocket, WAMessage } from '@whiskeysockets/baileys'
import { downloadMediaMessage } from '@whiskeysockets/baileys'
import { getGroupConfig } from './index.js'

// ─────────────────────────────────────────────────────────────────────────────
//  antiviewonce — reenvía medios de "ver una vez" cuando viewonce=ON
//  No usa Rust (es descarga de media, no análisis de texto).
// ─────────────────────────────────────────────────────────────────────────────

function formatSize(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB']
  let i = 0
  let size = bytes
  while (size >= 1024 && i < units.length - 1) { size /= 1024; i++ }
  return `${size.toFixed(1)} ${units[i]}`
}

export async function handleViewOnce(
  sock: WASocket,
  jid:  string,
  msg:  WAMessage,
): Promise<void> {
  if (!jid.endsWith('@g.us')) return  // solo en grupos
  const config = getGroupConfig(jid)
  if (!config.viewonce) return

  const raw = msg.message
  if (!raw) return

  const viewMsg =
    raw.viewOnceMessageV2?.message ??
    (raw as any).viewOnceMessageV2Extension?.message ??
    null

  if (!viewMsg) return

  const type = Object.keys(viewMsg)[0] as string
  if (!['imageMessage', 'videoMessage', 'audioMessage'].includes(type)) return

  try {
    const buffer = await downloadMediaMessage(
      { ...msg, message: viewMsg } as WAMessage,
      'buffer',
      {},
    ) as Buffer

    const inner    = (viewMsg as any)[type]
    const fileSize = formatSize(Number(inner?.fileLength ?? 0))
    const sender   = msg.key.participant ?? msg.key.remoteJid ?? ''
    const num      = sender.replace('@s.whatsapp.net', '').replace('@lid', '').replace(/[^0-9]/g, '')
    const caption  = inner?.caption ? `\n> ${inner.caption}` : ''

    const description = [
      `🕵️ *Anti Ver-Una-Vez*`,
      `👤 De: @${num}`,
      `📦 Tamaño: ${fileSize}`,
      caption,
    ].filter(Boolean).join('\n')

    if (type === 'imageMessage') {
      await sock.sendMessage(jid, {
        image:    buffer,
        caption:  description,
        mentions: [sender],
      }, { quoted: msg })
    } else if (type === 'videoMessage') {
      await sock.sendMessage(jid, {
        video:    buffer,
        caption:  description,
        mentions: [sender],
      }, { quoted: msg })
    } else if (type === 'audioMessage') {
      await sock.sendMessage(jid, { text: description, mentions: [sender] }, { quoted: msg })
      await sock.sendMessage(jid, {
        audio:    buffer,
        mimetype: 'audio/mpeg',
        ptt:      true,
      })
    }
  } catch {
    // descarga fallida — ignorar silenciosamente
  }
}
