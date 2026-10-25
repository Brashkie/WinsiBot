// A quién apunta un comando de admin: el mencionado, el autor del mensaje
// citado, o un número escrito. Antes cada comando lo resolvía a su manera, y
// #kick sin argumentos armaba "undefined@s.whatsapp.net".

import type { WAMessage } from '@whiskeysockets/baileys'
import { objetivoDe } from '@lib/messages.js'

export function destinoDe(msg: WAMessage, args: string[]): string | null {
  const directo = objetivoDe(msg)
  if (directo) return directo
  const num = (args[0] ?? '').replace(/\D/g, '')
  // Un número con código de país tiene 8 dígitos o más.
  return num.length >= 8 ? `${num}@s.whatsapp.net` : null
}

/** Lo que WhatsApp devuelve en groupParticipantsUpdate, por participante. */
export function resultadoDe(r: unknown): string | null {
  const s = Array.isArray(r) ? (r[0] as any)?.status : null
  return s === undefined || s === null ? null : String(s)
}
