import type { Command } from '../../../types/index.js'
import axios from 'axios'

const command: Command = {
  name:        'fetch',
  aliases:     ['get', 'url'],
  description: 'Obtiene el contenido de una URL',
  category:    'owner',
  ownerOnly:   true,

  async execute({ sock, jid, msg, text }) {
    const url = text.trim()

    if (!url || !/^https?:\/\//.test(url)) {
      await sock.sendMessage(jid, {
        text: '§ Escribe una URL válida\nEjemplo: !fetch https://api.github.com',
      }, { quoted: msg })
      return
    }

    const res = await axios.get<ArrayBuffer>(url, {
      responseType:  'arraybuffer',
      timeout:       12_000,
      maxRedirects:  5,
      validateStatus: () => true,
    }).catch((e: any) => { throw new Error(e.message) })

    const ct = (res.headers['content-type'] ?? '') as string
    const buf = Buffer.from(res.data)

    if (ct.includes('image')) {
      await sock.sendMessage(jid, {
        image:   buf,
        caption: url,
      }, { quoted: msg })
      return
    }

    if (ct.includes('audio')) {
      await sock.sendMessage(jid, {
        audio:    buf,
        mimetype: ct.split(';')[0]!,
      }, { quoted: msg })
      return
    }

    if (ct.includes('video')) {
      await sock.sendMessage(jid, {
        video:    buf,
        mimetype: ct.split(';')[0]!,
      }, { quoted: msg })
      return
    }

    // text / json / html → send as text
    let body = buf.toString('utf-8')
    if (ct.includes('json')) {
      try { body = JSON.stringify(JSON.parse(body), null, 2) } catch {}
    }

    await sock.sendMessage(jid, {
      text: body.slice(0, 4_000) || '(sin contenido)',
    }, { quoted: msg })
  },
}

export default command
