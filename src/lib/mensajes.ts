// Lo que varios comandos sacan de un mensaje. Cada uno tenía su copia.

import { downloadContentFromMessage, type WAMessage } from '@whiskeysockets/baileys'

/** La imagen del mensaje, o la del mensaje al que responde; null si no hay. */
export async function imagenDelMensaje(msg: WAMessage): Promise<Buffer | null> {
  try {
    const imgMsg =
      msg.message?.imageMessage ??
      msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage
    if (!imgMsg) return null
    const stream = await downloadContentFromMessage(imgMsg, 'image')
    const chunks: Buffer[] = []
    for await (const chunk of stream) chunks.push(chunk)
    return Buffer.concat(chunks)
  } catch {
    return null
  }
}

/** A quién apunta el mensaje: el primero mencionado, o el autor del mensaje citado. */
export function objetivoDe(msg: WAMessage): string | undefined {
  const ctx = msg.message?.extendedTextMessage?.contextInfo
  return (ctx?.mentionedJid ?? [])[0] ?? ctx?.participant ?? undefined
}
