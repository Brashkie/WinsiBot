// meme.ts — helper compartido entre #meme y #memepe (antes ~90% código
// idéntico copiado entre los dos: misma animación de búsqueda, mismo fetch
// de un JSON con lista de URLs, mismo envío de imagen con caption).
import type { WASocket, WAMessage } from '@whiskeysockets/baileys'
import axios from 'axios'
import { USER_AGENT } from '@config'
import { sleep } from './utils.js'

export interface RandomMemeOptions {
  url:             string
  searchLabel:     string   // ej. "meme" | "meme peruano"
  notFoundPlural:  string   // ej. "memes" | "memes peruanos" (concordancia correcta)
  captionTitle:    string   // ej. "Meme aleatorio" | "Meme peruano"
  extraCaption?:   string   // línea extra opcional (ej. "> ¡Me causa! 😂🇵🇪")
}

export async function sendRandomMeme(
  sock: WASocket,
  jid:  string,
  msg:  WAMessage,
  opts: RandomMemeOptions,
): Promise<void> {
  const { url: jsonUrl, searchLabel, notFoundPlural, captionTitle, extraCaption } = opts

  const frames = [
    `◈ Buscando ${searchLabel}...`,
    `◈◈ Buscando ${searchLabel}...`,
    `◈◈◈ Buscando ${searchLabel}...`,
    `◈◈ Buscando ${searchLabel}...`,
  ]

  const sent = await sock.sendMessage(jid, { text: frames[0]! }, { quoted: msg })
  const key  = sent?.key

  for (let i = 1; i < frames.length; i++) {
    await sleep(400)
    await sock.sendMessage(jid, { text: frames[i]!, edit: key } as any)
  }

  await sleep(300)
  await sock.sendMessage(jid, { text: '▣ Descargando...', edit: key } as any)

  const res = await axios.get<string[]>(jsonUrl, {
    headers: { 'User-Agent': USER_AGENT },
    timeout: 15_000,
  })

  const memes = res.data

  if (!Array.isArray(memes) || memes.length === 0) {
    await sock.sendMessage(jid, { text: `✗ No se encontraron ${notFoundPlural}.`, edit: key } as any)
    return
  }

  const url = memes[Math.floor(Math.random() * memes.length)]

  if (!url?.startsWith('http')) {
    await sock.sendMessage(jid, { text: '✗ URL invalida.', edit: key } as any)
    return
  }

  const imgRes = await axios.get<ArrayBuffer>(url, { responseType: 'arraybuffer', timeout: 15_000 })
  const buffer = Buffer.from(imgRes.data)

  const caption = [
    `◆ ${captionTitle}`,
    `§ ${memes.length} memes disponibles`,
    ...(extraCaption ? ['', extraCaption] : []),
  ].join('\n')

  await sleep(200)
  await sock.sendMessage(jid, { image: buffer, caption }, { quoted: msg })
}
