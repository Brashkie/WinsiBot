import type { Command } from '../../../types/index.js'
import axios from 'axios'
import { lookupPublico, motivoParaNoPedir } from '@lib/publicAddress.js'

const command: Command = {
  name:        'fetch',
  aliases:     ['get', 'url'],
  description: 'Obtiene el contenido de una URL pública (no de la propia máquina ni de la red local)',
  category:    'owner',
  ownerOnly:   true,

  async execute({ sock, jid, msg, text }) {
    const url = text.trim()

    if (!url) {
      await sock.sendMessage(jid, {
        text: '§ Escribe una URL válida\nEjemplo: !fetch https://api.github.com',
      }, { quoted: msg })
      return
    }

    // Nada de la propia máquina ni de la red local: ahí escuchan la Session
    // API y el panel, y en una nube 169.254.169.254 da las credenciales de la
    // máquina. Dos barreras: la URL (una IP escrita no pasa por el DNS) y la
    // dirección con la que de verdad se conecta (ver lib/publicAddress.ts).
    const motivo = motivoParaNoPedir(url)
    if (motivo) {
      await sock.sendMessage(jid, { text: `§ No: ${motivo}` }, { quoted: msg })
      return
    }

    const res = await axios.get<ArrayBuffer>(url, {
      responseType:     'arraybuffer',
      timeout:          12_000,
      // Una redirección podría llevar a una dirección interna escrita como IP,
      // que el lookup no ve: no se siguen, se muestra a dónde iban.
      maxRedirects:     0,
      maxContentLength: 20 * 1024 * 1024,
      lookup:           lookupPublico,
      validateStatus:   () => true,
    } as any).catch((e: any) => { throw new Error(e.message) })

    const destino = res.headers.location
    if (res.status >= 300 && res.status < 400 && destino) {
      await sock.sendMessage(jid, { text: `§ Redirige a: ${destino}` }, { quoted: msg })
      return
    }

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
