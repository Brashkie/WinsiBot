import type { Command } from '../../../types/index.js'
import axios from 'axios'

const command: Command = {
  name:        'downloadapk',
  aliases:     ['apkdownload', 'getapk'],
  description: 'Descarga un APK desde una URL directa',
  category:    'downloader',
  cooldown:    15,
  limit:       2,

  async execute({ sock, jid, msg, args }) {
    // Formato: !downloadapk <url>|<nombre.apk>
    const input = args.join(' ').trim()
    if (!input) {
      await sock.sendMessage(jid, {
        text: '◈ Uso: !downloadapk <url>|<nombre.apk>',
      }, { quoted: msg })
      return
    }

    const pipeIdx = input.lastIndexOf('|')
    if (pipeIdx === -1) {
      await sock.sendMessage(jid, {
        text: '✗ Formato inválido. Usa: !downloadapk <url>|<nombre.apk>',
      }, { quoted: msg })
      return
    }

    const downloadUrl = input.slice(0, pipeIdx).trim()
    const fileName    = input.slice(pipeIdx + 1).trim() || 'app.apk'

    const sent = await sock.sendMessage(jid, {
      text: '◈ Descargando APK...',
    }, { quoted: msg })
    const key = sent?.key

    let buffer: Buffer
    try {
      const res = await axios.get<ArrayBuffer>(downloadUrl, {
        responseType: 'arraybuffer',
        timeout:      60_000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Android 13; Mobile) AppleWebKit/537.36',
        },
      })
      buffer = Buffer.from(res.data)
    } catch {
      await sock.sendMessage(jid, {
        text: '✗ No se pudo descargar el APK. La URL puede haber expirado.',
        edit: key,
      } as any)
      return
    }

    const sizeMB = buffer.length / 1_048_576

    if (sizeMB > 100) {
      await sock.sendMessage(jid, {
        text: `✗ El archivo es muy grande (${sizeMB.toFixed(1)} MB).\n§ WhatsApp permite máximo 100 MB.`,
        edit: key,
      } as any)
      return
    }

    if (sizeMB < 0.01) {
      await sock.sendMessage(jid, {
        text: '✗ El archivo descargado está vacío o es inválido.',
        edit: key,
      } as any)
      return
    }

    await sock.sendMessage(jid, { text: '◈ Enviando...', edit: key } as any)

    await sock.sendMessage(jid, {
      document: buffer,
      mimetype: 'application/vnd.android.package-archive',
      fileName,
      caption:  `📱 *${fileName}*\n💾 ${sizeMB.toFixed(2)} MB\n\n> ⚠️ Instalación bajo tu responsabilidad`,
    }, { quoted: msg })
  },
}

export default command
